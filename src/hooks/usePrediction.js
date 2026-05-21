import { useCallback, useEffect, useState } from 'react';
import { useAccount, useConfig, useSwitchChain } from 'wagmi';
import { waitForTransactionReceipt, writeContract } from 'wagmi/actions';
import { parseAbi } from 'viem';
import { useAppStore } from '../store/useAppStore';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESSES,
  PREDICTION_POOL_ABI,
  DISPUTE_REGISTRY_ABI,
  XLAYER_RPC_URLS,
  decodeContractError,
  formatEtherVal,
  logRpcError
} from '../utils/contractHelpers';
import { savePersonalTransaction } from '../utils/transactionHistory';
import { xLayerTestnet } from '../config/wagmi';

let cache = {
  pools: null,
  disputes: null,
  lastFetchedPools: 0,
  lastFetchedDisputes: 0
};

const STALE_TIME = 15000;
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

const WAGMI_ABIS = {
  PredictionPool: parseAbi(PREDICTION_POOL_ABI),
  DisputeRegistry: parseAbi(DISPUTE_REGISTRY_ABI)
};

const ensurePositiveAmount = (amount) => {
  const value = ethers.parseEther(amount.toString());
  if (value <= 0n) {
    throw new Error('Amount must be greater than 0 OKB.');
  }
  return value;
};

const getRevertMessage = (error) => decodeContractError(error);

export const usePrediction = () => {
  const {
    setWalletState,
    addNotification,
    predictionPools,
    userPoolBets,
    disputes,
    userDisputeVotes,
    setPredictionPools,
    setDisputes,
    setUserPoolBets,
    setUserDisputeVotes
  } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [contractOwner, setContractOwner] = useState(null);
  const config = useConfig();
  const { address, chainId, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const refreshBalance = useCallback(async () => {
    if (!isConnected || !address) return;

    try {
      const provider = new ethers.JsonRpcProvider(XLAYER_RPC_URLS[activeRpcIndex]);
      const rawBalance = await provider.getBalance(address);
      const formattedBalance = parseFloat(ethers.formatEther(rawBalance)).toFixed(4);
      setWalletState({ balance: formattedBalance });
    } catch (error) {
      logRpcError('BALANCE REFRESH FAILED', error);
    }
  }, [address, isConnected, setWalletState]);

  const getContract = useCallback(async (contractType) => {
    const provider = new ethers.JsonRpcProvider(XLAYER_RPC_URLS[activeRpcIndex]);
    const contractAddress = CONTRACT_ADDRESSES[contractType];
    const abi = getContractAbi(contractType);
    return new ethers.Contract(contractAddress, abi, provider);
  }, []);

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
  }, [fetchContractOwner]);

  const fetchUserPoolBets = useCallback(async (poolIds) => {
    if (!address || poolIds.length === 0) {
      setUserPoolBets({});
      return;
    }

    try {
      const contract = await getContract('PredictionPool');
      const entries = await Promise.all(poolIds.map(async (poolId) => {
        const bet = await contract.bets(poolId, address);
        return [
          poolId,
          {
            outcome: Number(bet[0]),
            amount: formatEtherVal(bet[1]),
            claimed: Boolean(bet[2])
          }
        ];
      }));

      setUserPoolBets(Object.fromEntries(entries));
    } catch (error) {
      logRpcError('USER POOL BETS FETCH FAILED', error);
    }
  }, [address, getContract, setUserPoolBets]);

  const fetchUserDisputeVotes = useCallback(async (playIds) => {
    if (!address || playIds.length === 0) {
      setUserDisputeVotes({});
      return;
    }

    try {
      const contract = await getContract('DisputeRegistry');
      const entries = await Promise.all(playIds.map(async (playId) => {
        const vote = await contract.votes(playId, address);
        return [
          playId,
          {
            choice: Number(vote[0]),
            stake: formatEtherVal(vote[1]),
            claimed: Boolean(vote[2])
          }
        ];
      }));

      setUserDisputeVotes(Object.fromEntries(entries));
    } catch (error) {
      logRpcError('USER DISPUTE VOTES FETCH FAILED', error);
    }
  }, [address, getContract, setUserDisputeVotes]);

  const fetchPredictionPools = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && cache.pools && (now - cache.lastFetchedPools < STALE_TIME)) {
      setPredictionPools(cache.pools);
      await fetchUserPoolBets(cache.pools.map((pool) => pool.poolId));
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
      cache.pools = activePools;
      cache.lastFetchedPools = now;
      setPredictionPools(activePools);
      await fetchUserPoolBets(activePools.map((pool) => pool.poolId));
    } catch (error) {
      logRpcError('PREDICTION POOLS FETCH FAILED', error);
      rotateRpcUrl();
    } finally {
      setLoading(false);
    }
  }, [fetchUserPoolBets, getContract, setPredictionPools]);

  const fetchDisputes = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && cache.disputes && (now - cache.lastFetchedDisputes < STALE_TIME)) {
      setDisputes(cache.disputes);
      await fetchUserDisputeVotes(cache.disputes.map((dispute) => dispute.playId));
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
      cache.disputes = activeDisputes;
      cache.lastFetchedDisputes = now;
      setDisputes(activeDisputes);
      await fetchUserDisputeVotes(activeDisputes.map((dispute) => dispute.playId));
    } catch (error) {
      logRpcError('DISPUTES FETCH FAILED', error);
      rotateRpcUrl();
    }
  }, [fetchUserDisputeVotes, getContract, setDisputes]);

  const handleContractTx = useCallback(async ({
    contractType,
    method,
    args,
    value = null,
    pendingMsg,
    successMsg,
    onSuccess,
    history
  }) => {
    if (!isConnected) {
      addNotification('error', 'Please connect a wallet first.');
      return false;
    }

    setLoading(true);
    addNotification('pending', pendingMsg);

    try {
      if (chainId !== xLayerTestnet.id) {
        await switchChainAsync({ chainId: xLayerTestnet.id });
      }

      console.log(`[TRANSACTION] ${contractType}.${method}`, { args, value });
      const hash = await writeContract(config, {
        address: CONTRACT_ADDRESSES[contractType],
        abi: WAGMI_ABIS[contractType],
        functionName: method,
        args,
        value: value || undefined,
        chainId: xLayerTestnet.id
      });

      addNotification('pending', 'Transaction submitted. Awaiting confirmation...', hash);
      savePersonalTransaction(address, {
        hash,
        type: history?.type || method,
        label: history?.label || pendingMsg,
        amount: history?.amount || '',
        target: history?.target || '',
        status: 'submitted'
      });

      await waitForTransactionReceipt(config, {
        hash,
        chainId: xLayerTestnet.id
      });

      clearPredictionCache();
      savePersonalTransaction(address, {
        hash,
        type: history?.type || method,
        label: history?.label || successMsg,
        amount: history?.amount || '',
        target: history?.target || '',
        status: 'confirmed'
      });
      addNotification('success', successMsg, hash);
      if (onSuccess) await onSuccess();
      await refreshBalance();
      return true;
    } catch (error) {
      logRpcError(`${contractType}.${method} FAILED`, error);
      addNotification('error', `Transaction failed: ${getRevertMessage(error)}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [addNotification, address, chainId, config, isConnected, refreshBalance, switchChainAsync]);

  const placePrediction = useCallback(async (poolId, outcome, amount) => {
    const value = ensurePositiveAmount(amount);

    return await handleContractTx({
      contractType: 'PredictionPool',
      method: 'placePrediction',
      args: [poolId, outcome],
      value,
      pendingMsg: `Confirm prediction in wallet: ${amount} OKB...`,
      successMsg: 'Prediction transaction confirmed!',
      history: {
        type: 'Prediction',
        label: `Placed prediction on Pool #${poolId} - Outcome ${outcome}`,
        amount: `${amount} OKB`,
        target: `Pool #${poolId}`
      },
      onSuccess: () => fetchPredictionPools(true)
    });
  }, [handleContractTx, fetchPredictionPools]);

  const castJuryVote = useCallback(async (playId, choice, amount) => {
    const value = ensurePositiveAmount(amount);

    return await handleContractTx({
      contractType: 'DisputeRegistry',
      method: 'castJuryVote',
      args: [playId, choice],
      value,
      pendingMsg: `Confirm jury vote in wallet: ${amount} OKB...`,
      successMsg: 'Jury vote transaction confirmed!',
      history: {
        type: 'Jury Vote',
        label: `Cast jury vote on Play #${playId} - Choice ${choice}`,
        amount: `${amount} OKB`,
        target: `Play #${playId}`
      },
      onSuccess: () => fetchDisputes(true)
    });
  }, [handleContractTx, fetchDisputes]);

  const claimPayout = useCallback(async (poolId) => (
    await handleContractTx({
      contractType: 'PredictionPool',
      method: 'claimPayout',
      args: [poolId],
      pendingMsg: `Claiming payout for pool ${poolId}...`,
      successMsg: 'Payout claimed successfully!',
      history: {
        type: 'Claim',
        label: `Claimed payout for Pool #${poolId}`,
        target: `Pool #${poolId}`
      },
      onSuccess: () => fetchPredictionPools(true)
    })
  ), [fetchPredictionPools, handleContractTx]);

  const claimRefund = useCallback(async (poolId) => (
    await handleContractTx({
      contractType: 'PredictionPool',
      method: 'claimRefund',
      args: [poolId],
      pendingMsg: `Claiming refund for pool ${poolId}...`,
      successMsg: 'Refund claimed successfully!',
      history: {
        type: 'Refund',
        label: `Claimed refund for Pool #${poolId}`,
        target: `Pool #${poolId}`
      },
      onSuccess: () => fetchPredictionPools(true)
    })
  ), [fetchPredictionPools, handleContractTx]);

  const claimJuryRewards = useCallback(async (playId) => (
    await handleContractTx({
      contractType: 'DisputeRegistry',
      method: 'claimJuryRewards',
      args: [playId],
      pendingMsg: `Claiming jury rewards for play ${playId}...`,
      successMsg: 'Jury rewards claimed successfully!',
      history: {
        type: 'Claim',
        label: `Claimed jury rewards for Play #${playId}`,
        target: `Play #${playId}`
      },
      onSuccess: () => fetchDisputes(true)
    })
  ), [fetchDisputes, handleContractTx]);

  const createPoolAndDispute = useCallback(async (playId, poolId, question, description, durationSeconds) => {
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
  }, [handleContractTx, fetchPredictionPools, fetchDisputes]);

  return {
    loading,
    predictionPools,
    userPoolBets,
    disputes,
    userDisputeVotes,
    contractOwner,
    fetchPredictionPools,
    fetchDisputes,
    placePrediction,
    castJuryVote,
    claimPayout,
    claimRefund,
    claimJuryRewards,
    createPoolAndDispute
  };
};
