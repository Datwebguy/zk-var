import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESSES,
  PREDICTION_POOL_ABI,
  DISPUTE_REGISTRY_ABI,
  XLAYER_RPC_URLS,
  decodeContractError,
  formatEtherVal,
  getInjectedProvider,
  getWeb3Provider,
  isEmptyWalletRpcError,
  logRpcError
} from '../utils/contractHelpers';

let cache = {
  pools: null,
  disputes: null,
  lastFetchedPools: 0,
  lastFetchedDisputes: 0
};

const STALE_TIME = 15000;
const GAS_LIMIT_BUFFER_PERCENT = 130n;
let activeRpcIndex = 0;

const rotateRpcUrl = () => {
  activeRpcIndex = (activeRpcIndex + 1) % XLAYER_RPC_URLS.length;
  console.warn(`[ZK-VAR] Rotating fallback RPC URL to index ${activeRpcIndex}: ${XLAYER_RPC_URLS[activeRpcIndex]}`);
};

const clearPredictionCache = () => {
  cache = {
    pools: null,
    disputes: null,
    lastFetchedPools: 0,
    lastFetchedDisputes: 0
  };
};

const getContractAbi = (contractType) => (
  contractType === 'PredictionPool' ? PREDICTION_POOL_ABI : DISPUTE_REGISTRY_ABI
);

const buildPredictionTxData = async ({ contract, from, poolId, outcome, value }) => ({
  from,
  to: await contract.getAddress(),
  data: contract.interface.encodeFunctionData('placePrediction', [poolId, outcome]),
  value
});

const validatePool = async ({ contract, poolId }) => {
  console.log(`[PRE-FLIGHT] Querying Pool ${poolId} details...`);
  const pool = await contract.pools(poolId);

  if (!pool.exists) {
    throw new Error(`Pre-flight failed: Pool ${poolId} does not exist on-chain.`);
  }

  if (Number(pool.status) !== 0) {
    throw new Error(`Pre-flight failed: Pool ${poolId} is not Open (Current status: ${pool.status.toString()}).`);
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (nowInSeconds >= Number(pool.closingTime)) {
    throw new Error(`Pre-flight failed: Pool ${poolId} is closed for predictions (closing time passed).`);
  }

  return pool;
};

const validatePredictionInput = ({ amount, value }) => {
  if (value <= 0n) {
    throw new Error(`Pre-flight failed: Bet amount must be greater than 0 OKB (Sending: ${amount} OKB).`);
  }
};

const validateBalance = async ({ provider, userAddress, value, amount }) => {
  const balance = await provider.getBalance(userAddress);
  if (balance < value) {
    throw new Error(`Insufficient OKB balance. Wallet has: ${ethers.formatEther(balance)} OKB, Need: ${amount} OKB.`);
  }
  return balance;
};

const validateExistingBet = async ({ contract, poolId, userAddress, outcome }) => {
  const userBet = await contract.bets(poolId, userAddress);
  if (userBet.amount > 0n && Number(userBet.outcome) !== Number(outcome)) {
    throw new Error(`Pre-flight failed: Cannot change prediction outcome side (already bet on Outcome ${userBet.outcome.toString()}).`);
  }
  return userBet;
};

const simulateTransaction = async ({ provider, txData, contract }) => {
  console.log("[SIMULATION] Simulating placePrediction via eth_call...");

  try {
    await provider.call(txData);
    console.log("[SIMULATION] eth_call simulation succeeded! Transaction is safe to broadcast.");
  } catch (error) {
    logRpcError('SIMULATION FAILED', error);
    throw new Error(`Simulation failed on-chain: ${decodeContractError(error, contract.interface)}`, { cause: error });
  }
};

const estimatePredictionGas = async ({ contract, poolId, outcome, value }) => {
  try {
    const estimatedGas = await contract.placePrediction.estimateGas(poolId, outcome, { value });
    const gasLimit = (estimatedGas * GAS_LIMIT_BUFFER_PERCENT) / 100n;
    console.log(`[TRANSACTION] Estimated Gas: ${estimatedGas.toString()}. Buffered gasLimit: ${gasLimit.toString()}`);
    return gasLimit;
  } catch (error) {
    logRpcError('GAS ESTIMATION FAILED', error);
    return null;
  }
};

const sendViaContract = async ({ contract, poolId, outcome, txOptions, label }) => {
  console.log(`[TRANSACTION] ${label} payload:`, {
    to: await contract.getAddress(),
    method: 'placePrediction',
    poolId,
    outcome,
    ...txOptions
  });

  const tx = await contract.placePrediction(poolId, outcome, txOptions);
  console.log(`[TRANSACTION] ${label} submitted: ${tx.hash}`);
  return tx;
};

const sendViaSigner = async ({ signer, txData, label }) => {
  console.log(`[TRANSACTION] ${label} payload:`, txData);
  const tx = await signer.sendTransaction(txData);
  console.log(`[TRANSACTION] ${label} submitted: ${tx.hash}`);
  return tx;
};

const broadcastPrediction = async ({ contract, signer, txData, poolId, outcome, value, gasLimit }) => {
  try {
    const txOptions = gasLimit ? { value, gasLimit } : { value };
    return await sendViaContract({
      contract,
      poolId,
      outcome,
      txOptions,
      label: gasLimit ? 'contract method with gasLimit' : 'contract method wallet-estimated'
    });
  } catch (firstError) {
    logRpcError('TRANSACTION CONTRACT METHOD FAILED', firstError);

    if (!isEmptyWalletRpcError(firstError)) {
      throw firstError;
    }

    console.warn("[TRANSACTION] Empty wallet RPC error detected. Retrying once with value only and wallet-native estimation.");
    try {
      return await sendViaContract({
        contract,
        poolId,
        outcome,
        txOptions: { value },
        label: 'contract method retry without gas overrides'
      });
    } catch (retryError) {
      logRpcError('TRANSACTION CONTRACT RETRY FAILED', retryError);

      if (!isEmptyWalletRpcError(retryError)) {
        throw retryError;
      }

      console.warn("[TRANSACTION] Contract method retry failed with empty wallet RPC error. Falling back to signer.sendTransaction.");
      return await sendViaSigner({
        signer,
        txData,
        label: 'raw signer.sendTransaction fallback'
      });
    }
  }
};

export const usePrediction = () => {
  const {
    walletConnected,
    userAddress,
    walletType,
    setWalletState,
    addNotification,
    predictionPools,
    disputes,
    setPredictionPools,
    setDisputes
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [contractOwner, setContractOwner] = useState(null);

  const refreshBalance = useCallback(async () => {
    if (!walletConnected || !userAddress || typeof window === 'undefined') return;
    const provider = getInjectedProvider(walletType);
    if (!provider) return;

    try {
      const browserProvider = new ethers.BrowserProvider(provider);
      const rawBalance = await browserProvider.getBalance(userAddress);
      const formattedBalance = parseFloat(ethers.formatEther(rawBalance)).toFixed(4);
      setWalletState({ balance: formattedBalance });
    } catch (error) {
      logRpcError('BALANCE REFRESH FAILED', error);
    }
  }, [walletConnected, walletType, userAddress, setWalletState]);

  const getContract = useCallback(async (contractType, needsSigner = false) => {
    let provider = null;
    if (walletConnected) {
      provider = getWeb3Provider(walletType);
    }

    if (!provider) {
      if (needsSigner) return null;
      provider = new ethers.JsonRpcProvider(XLAYER_RPC_URLS[activeRpcIndex]);
    }

    const address = CONTRACT_ADDRESSES[contractType];
    const abi = getContractAbi(contractType);

    if (needsSigner) {
      const signer = await provider.getSigner();
      return new ethers.Contract(address, abi, signer);
    }

    return new ethers.Contract(address, abi, provider);
  }, [walletConnected, walletType]);

  const fetchContractOwner = useCallback(async () => {
    try {
      const contract = await getContract('PredictionPool');
      if (contract) return await contract.owner();
    } catch (error) {
      logRpcError('CONTRACT OWNER FETCH FAILED', error);
      rotateRpcUrl();
    }
    return null;
  }, [getContract]);

  useEffect(() => {
    let cancelled = false;

    const loadContractOwner = async () => {
      const owner = await fetchContractOwner();
      if (!cancelled && owner) {
        setContractOwner(owner);
      }
    };

    loadContractOwner();

    return () => {
      cancelled = true;
    };
  }, [fetchContractOwner, walletConnected]);

  const fetchPredictionPools = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && cache.pools && (now - cache.lastFetchedPools < STALE_TIME)) {
      setPredictionPools(cache.pools);
      return;
    }

    setLoading(true);
    try {
      const contract = await getContract('PredictionPool');
      if (!contract) return;

      const poolIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const results = await Promise.all(poolIds.map(async (id) => {
        try {
          const details = await contract.getPoolDetails(id);
          const questionText = details[0];
          const closingTime = Number(details[1]);
          if (closingTime === 0) return null;

          return {
            poolId: id,
            question: questionText && questionText.trim() !== "" ? questionText : `Custom Arena Pool #${id}`,
            closingTime,
            status: Number(details[2]),
            winningOutcome: Number(details[3]),
            totalStaked: formatEtherVal(details[4]),
            stakedOutcome1: formatEtherVal(details[5]),
            stakedOutcome2: formatEtherVal(details[6]),
            disputeId: 100 + id,
            match: id <= 2 ? "Argentina vs France" : "Custom Arena Match"
          };
        } catch (error) {
          console.warn(`Pool ${id} fetch error:`, error);
          return null;
        }
      }));

      const activePools = results.filter(Boolean);
      if (activePools.length > 0) {
        cache.pools = activePools;
        cache.lastFetchedPools = now;
        setPredictionPools(activePools);
      }
    } catch (error) {
      logRpcError('PREDICTION POOLS FETCH FAILED', error);
      rotateRpcUrl();
    } finally {
      setLoading(false);
    }
  }, [getContract, setPredictionPools]);

  const fetchDisputes = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && cache.disputes && (now - cache.lastFetchedDisputes < STALE_TIME)) {
      setDisputes(cache.disputes);
      return;
    }

    try {
      const contract = await getContract('DisputeRegistry');
      if (!contract) return;

      const disputeIds = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
      const results = await Promise.all(disputeIds.map(async (id) => {
        try {
          const details = await contract.getDisputeDetails(id);
          const poolId = Number(details[0]);
          const descText = details[1];
          const votingEndTime = Number(details[2]);
          if (votingEndTime === 0) return null;

          return {
            playId: id,
            predictionPoolId: poolId,
            description: descText && descText.trim() !== "" ? descText : `Custom Play Review #${id}`,
            votingEndTime,
            status: Number(details[3]),
            totalJuryStaked: formatEtherVal(details[4]),
            votesValid: formatEtherVal(details[5]),
            votesInvalid: formatEtherVal(details[6]),
            votesInconclusive: formatEtherVal(details[7]),
            exists: true,
            verdict: Number(details[8]),
            resolutionTime: Number(details[9]),
            decisionType: id % 2 === 1 ? "Offside Detection" : "Out of Bounds"
          };
        } catch (error) {
          console.warn(`Dispute ${id} fetch error:`, error);
          return null;
        }
      }));

      const activeDisputes = results.filter(Boolean);
      if (activeDisputes.length > 0) {
        cache.disputes = activeDisputes;
        cache.lastFetchedDisputes = now;
        setDisputes(activeDisputes);
      }
    } catch (error) {
      logRpcError('DISPUTES FETCH FAILED', error);
      rotateRpcUrl();
    }
  }, [getContract, setDisputes]);

  const handleContractTx = useCallback(async ({
    contractType,
    method,
    args,
    value = null,
    pendingMsg,
    successMsg,
    onSuccess,
    onFailure
  }) => {
    setLoading(true);
    addNotification('pending', pendingMsg);

    try {
      const contract = await getContract(contractType, true);
      if (!contract) throw new Error(`${contractType} contract instance not initialized.`);

      const txOptions = value ? { value } : {};
      console.log(`[TRANSACTION] ${contractType}.${method} wallet-native payload:`, { args, txOptions });
      const tx = await contract[method](...args, txOptions);
      console.log(`[TRANSACTION] ${contractType}.${method} submitted: ${tx.hash}`);
      addNotification('pending', `Transaction submitted. Awaiting confirmation...`, tx.hash);

      await tx.wait();
      clearPredictionCache();
      addNotification('success', successMsg, tx.hash);

      if (onSuccess) await onSuccess();
      await refreshBalance();
      return true;
    } catch (error) {
      logRpcError(`${contractType}.${method} FAILED`, error);
      if (onFailure) onFailure();
      addNotification('error', `Transaction failed: ${decodeContractError(error)}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [getContract, addNotification, refreshBalance]);

  const placePrediction = useCallback(async (poolId, outcome, amount) => {
    if (!walletConnected) {
      addNotification('error', 'Please connect your Web3 wallet to place a prediction on-chain.');
      return false;
    }

    const value = ethers.parseEther(amount.toString());
    setLoading(true);
    addNotification('pending', 'Performing pre-flight checks and simulating transaction on-chain...');

    try {
      const contract = await getContract('PredictionPool', true);
      if (!contract) throw new Error("PredictionPool contract instance not initialized.");

      const provider = getWeb3Provider(walletType);
      if (!provider) throw new Error("Web3 provider missing.");

      const signer = await provider.getSigner();
      const connectedAddress = await signer.getAddress();

      validatePredictionInput({ amount, value });
      await validatePool({ contract, poolId });
      await validateBalance({ provider, userAddress: connectedAddress, value, amount });
      await validateExistingBet({ contract, poolId, userAddress: connectedAddress, outcome });

      console.log("[PRE-FLIGHT] Pre-flight checks passed successfully.");

      const txData = await buildPredictionTxData({
        contract,
        from: connectedAddress,
        poolId,
        outcome,
        value
      });

      await simulateTransaction({ provider, txData, contract });
      const gasLimit = await estimatePredictionGas({ contract, poolId, outcome, value });

      addNotification('pending', `Submitting prediction to wallet: ${amount} OKB...`);
      const tx = await broadcastPrediction({
        contract,
        signer,
        txData,
        poolId,
        outcome,
        value,
        gasLimit
      });

      addNotification('pending', 'Transaction submitted. Awaiting block confirmation...', tx.hash);
      await tx.wait();

      clearPredictionCache();
      addNotification('success', 'Prediction transaction confirmed!', tx.hash);
      await fetchPredictionPools(true);
      await refreshBalance();
      return true;
    } catch (error) {
      const decodedMessage = decodeContractError(error);
      logRpcError('TRANSACTION FAILED', error);
      addNotification('error', `Transaction execution failed: ${decodedMessage}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [walletConnected, walletType, getContract, fetchPredictionPools, refreshBalance, addNotification]);

  const castJuryVote = useCallback(async (playId, choice, amount) => {
    if (!walletConnected) {
      addNotification('error', 'Please connect your Web3 wallet to cast a jury vote on-chain.');
      return false;
    }

    return await handleContractTx({
      contractType: 'DisputeRegistry',
      method: 'castJuryVote',
      args: [playId, choice],
      value: ethers.parseEther(amount.toString()),
      pendingMsg: 'Preparing transaction: cast jury vote...',
      successMsg: 'Jury vote transaction confirmed!',
      onSuccess: () => fetchDisputes(true)
    });
  }, [walletConnected, fetchDisputes, addNotification, handleContractTx]);

  const claimPayout = useCallback(async (poolId) => {
    if (!walletConnected) {
      addNotification('error', 'Please connect your Web3 wallet to claim payouts on-chain.');
      return false;
    }

    return await handleContractTx({
      contractType: 'PredictionPool',
      method: 'claimPayout',
      args: [poolId],
      pendingMsg: `Claiming payout for pool ${poolId}...`,
      successMsg: 'Payout claimed successfully!',
      onSuccess: () => fetchPredictionPools(true)
    });
  }, [walletConnected, fetchPredictionPools, handleContractTx, addNotification]);

  const claimJuryRewards = useCallback(async (playId) => {
    if (!walletConnected) {
      addNotification('error', 'Please connect your Web3 wallet to claim jury rewards on-chain.');
      return false;
    }

    return await handleContractTx({
      contractType: 'DisputeRegistry',
      method: 'claimJuryRewards',
      args: [playId],
      pendingMsg: `Claiming jury rewards for play ${playId}...`,
      successMsg: 'Jury rewards claimed successfully!',
      onSuccess: () => fetchDisputes(true)
    });
  }, [walletConnected, fetchDisputes, handleContractTx, addNotification]);

  const createPoolAndDispute = useCallback(async (playId, poolId, question, description, durationSeconds) => {
    if (!walletConnected) {
      addNotification('error', "Wallet must be connected to run admin commands.");
      return false;
    }

    const poolSuccess = await handleContractTx({
      contractType: 'PredictionPool',
      method: 'createPool',
      args: [poolId, question, durationSeconds],
      pendingMsg: `Creating Prediction Pool #${poolId} on-chain...`,
      successMsg: `Prediction Pool #${poolId} created!`,
      onSuccess: () => fetchPredictionPools(true)
    });

    if (!poolSuccess) return false;

    return await handleContractTx({
      contractType: 'DisputeRegistry',
      method: 'createDispute',
      args: [playId, poolId, description, durationSeconds],
      pendingMsg: `Creating Dispute #${playId} on-chain...`,
      successMsg: `Dispute #${playId} created successfully!`,
      onSuccess: () => fetchDisputes(true)
    });
  }, [walletConnected, handleContractTx, fetchPredictionPools, fetchDisputes, addNotification]);

  return {
    loading,
    predictionPools,
    disputes,
    contractOwner,
    fetchPredictionPools,
    fetchDisputes,
    placePrediction,
    castJuryVote,
    claimPayout,
    claimJuryRewards,
    createPoolAndDispute
  };
};
