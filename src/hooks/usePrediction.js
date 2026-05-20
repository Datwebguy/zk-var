import { useCallback, useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESSES,
  PREDICTION_POOL_ABI,
  DISPUTE_REGISTRY_ABI,
  getWeb3Provider,
  getInjectedProvider,
  applyXLayerLegacyFees,
  formatEtherVal
} from '../utils/contractHelpers';

// Module-level cache for staleTime implementation (15 seconds threshold)
let cache = {
  pools: null,
  disputes: null,
  lastFetchedPools: 0,
  lastFetchedDisputes: 0
};
const STALE_TIME = 15000; // 15 seconds in milliseconds

const RPC_URLS = [
  "https://testrpc.xlayer.tech/terigon",
  "https://xlayertestrpc.okx.com/terigon"
];
let activeRpcIndex = 0;

const rotateRpcUrl = () => {
  activeRpcIndex = (activeRpcIndex + 1) % RPC_URLS.length;
  console.warn(`[ZK-VAR] Rotating fallback RPC URL to index ${activeRpcIndex}: ${RPC_URLS[activeRpcIndex]}`);
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

  // Helper to query and refresh on-chain wallet balance dynamically
  const refreshBalance = useCallback(async () => {
    if (!walletConnected || !userAddress || typeof window === 'undefined') return;
    const provider = getInjectedProvider(walletType);
    if (!provider) return;
    try {
      const browserProvider = new ethers.BrowserProvider(provider);
      const rawBalance = await browserProvider.getBalance(userAddress);
      const formattedBalance = parseFloat(ethers.formatEther(rawBalance)).toFixed(4);
      setWalletState({ balance: formattedBalance });
    } catch (e) {
      console.error("Failed to refresh balance on-chain:", e);
    }
  }, [walletConnected, walletType, userAddress, setWalletState]);

  // Helper to instantiate active contract instance
  const getContract = useCallback(async (contractType, needsSigner = false) => {
    let provider = null;
    if (walletConnected) {
      provider = getWeb3Provider(walletType);
    }
    
    // Fallback to public RPC if no wallet connected or no provider (for read-only queries)
    if (!provider) {
      if (needsSigner) return null;
      provider = new ethers.JsonRpcProvider(RPC_URLS[activeRpcIndex]);
    }

    const address = CONTRACT_ADDRESSES[contractType];
    const abi = contractType === 'PredictionPool' ? PREDICTION_POOL_ABI : DISPUTE_REGISTRY_ABI;
    
    if (needsSigner) {
      const signer = await provider.getSigner();
      return new ethers.Contract(address, abi, signer);
    } else {
      return new ethers.Contract(address, abi, provider);
    }
  }, [walletConnected, walletType]);

  // Query contract owner address dynamically
  const fetchContractOwner = useCallback(async () => {
    try {
      const contract = await getContract('PredictionPool');
      if (contract) {
        return await contract.owner();
      }
    } catch (error) {
      console.error("Failed to fetch contract owner address:", error);
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

  /**
   * @notice Fetch live prediction pool states from X Layer Testnet
   * @param force Set to true to bypass cache and force a network refresh
   */
  const fetchPredictionPools = useCallback(async (force = false) => {
    const now = Date.now();
    // Cache check
    if (!force && cache.pools && (now - cache.lastFetchedPools < STALE_TIME)) {
      setPredictionPools(cache.pools);
      return;
    }

    setLoading(true);
    try {
      const contract = await getContract('PredictionPool');
      if (!contract) {
        setLoading(false);
        return; // Fallback to Zustand default mock data
      }

      // Fetch details for pool IDs 1 to 10 concurrently
      const poolIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      
      const fetchPromises = poolIds.map(async (id) => {
        try {
          const details = await contract.getPoolDetails(id);
          const questionText = details[0];
          const closingTime = Number(details[1]);

          // If the pool closingTime is 0, it means it doesn't exist on contract
          if (closingTime === 0) {
            return null;
          }

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
        } catch (e) {
          console.warn(`Pool ${id} fetch error:`, e);
          return null;
        }
      });

      const results = await Promise.all(fetchPromises);
      const activePools = results.filter((p) => p !== null);

      if (activePools.length > 0) {
        cache.pools = activePools;
        cache.lastFetchedPools = now;
        setPredictionPools(activePools);
      }
    } catch (error) {
      console.error("Failed to fetch prediction pools from contract:", error);
      rotateRpcUrl();
    } finally {
      setLoading(false);
    }
  }, [getContract, setPredictionPools]);

  /**
   * @notice Fetch live dispute logs from X Layer Testnet
   * @param force Set to true to bypass cache and force a network refresh
   */
  const fetchDisputes = useCallback(async (force = false) => {
    const now = Date.now();
    // Cache check
    if (!force && cache.disputes && (now - cache.lastFetchedDisputes < STALE_TIME)) {
      setDisputes(cache.disputes);
      return;
    }

    try {
      const contract = await getContract('DisputeRegistry');
      if (!contract) return; // Fallback to Zustand default mock data

      // Fetch details for dispute IDs 101 to 110 concurrently
      const disputeIds = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
      
      const fetchPromises = disputeIds.map(async (id) => {
        try {
          const details = await contract.getDisputeDetails(id);
          const poolId = Number(details[0]);
          const descText = details[1];
          const votingEndTime = Number(details[2]);

          // If votingEndTime is 0, it means it doesn't exist on contract
          if (votingEndTime === 0) {
            return null;
          }

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
        } catch (e) {
          console.warn(`Dispute ${id} fetch error:`, e);
          return null;
        }
      });

      const results = await Promise.all(fetchPromises);
      const activeDisputes = results.filter((d) => d !== null);

      if (activeDisputes.length > 0) {
        cache.disputes = activeDisputes;
        cache.lastFetchedDisputes = now;
        setDisputes(activeDisputes);
      }
    } catch (error) {
      console.error("Failed to fetch disputes from contract:", error);
      rotateRpcUrl();
    }
  }, [getContract, setDisputes]);

  /**
   * @notice Centralized transaction execution wrapper to eliminate redundant error catching
   */
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
      if (!contract) {
        throw new Error(`${contractType} contract instance not initialized.`);
      }

      const txOptions = value ? { value } : {};
      
      // Override fee parameters with legacy gasPrice to avoid wallet EIP-1559 calculation errors on X Layer
      const browserProvider = getWeb3Provider(walletType);
      if (browserProvider) {
        try {
          Object.assign(txOptions, await applyXLayerLegacyFees(browserProvider, txOptions));
          console.log(`[TRANSACTION] Applying legacy type-0 gasPrice override: ${txOptions.gasPrice.toString()} wei`);
        } catch (feeError) {
          console.warn(`[TRANSACTION] Failed to fetch fee data for legacy gasPrice override:`, feeError);
        }
      }

      try {
        // Estimate gas limit with a 30% buffer to avoid transaction dry-run failures on X Layer Testnet
        const estimatedGas = await contract[method].estimateGas(...args, txOptions);
        txOptions.gasLimit = (estimatedGas * 130n) / 100n;
        console.log(`Estimated gas for ${contractType}.${method}: ${estimatedGas.toString()}, applied gasLimit with 30% buffer: ${txOptions.gasLimit.toString()}`);
      } catch (estError) {
        console.warn(`Failed to estimate gas for ${contractType}.${method}, letting wallet handle estimation:`, estError);
      }

      const tx = await contract[method](...args, txOptions);
      addNotification('pending', `Transaction submitted. Awaiting confirmation...`, tx.hash);

      await tx.wait();
      addNotification('success', successMsg, tx.hash);
      
      if (onSuccess) {
        await onSuccess();
      }
      await refreshBalance(); // Automatically refresh user's on-chain wallet balance
      return true;
    } catch (error) {
      console.error(`Transaction execution failed for ${contractType}.${method}:`, error);
      if (onFailure) {
        onFailure();
      }
      addNotification('error', `Transaction failed or rejected on-chain.`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [getContract, addNotification, refreshBalance, walletType]);

  /**
   * @notice Place prediction on-chain on X Layer Testnet, with safe local state failover
   */
  const placePrediction = useCallback(async (poolId, outcome, amount) => {
    if (!walletConnected) {
      addNotification('error', 'Please connect your Web3 wallet to place a prediction on-chain.');
      return;
    }

    const txValue = ethers.parseEther(amount.toString());
    setLoading(true);
    addNotification('pending', `Performing pre-flight checks and simulating transaction on-chain...`);

    try {
      const contract = await getContract('PredictionPool', true);
      if (!contract) {
        throw new Error("PredictionPool contract instance not initialized.");
      }

      const browserProvider = getWeb3Provider(walletType);
      if (!browserProvider) {
        throw new Error("Web3 provider missing.");
      }

      // --- 4. PRE-FLIGHT CHECK: Validate pool is currently open and accepting predictions ---
      console.log(`[PRE-FLIGHT] Querying Pool ${poolId} details...`);
      const pool = await contract.pools(poolId);
      
      if (!pool.exists) {
        const errorMsg = `Pre-flight failed: Pool ${poolId} does not exist on-chain.`;
        console.error(errorMsg);
        addNotification('error', errorMsg);
        throw new Error(errorMsg);
      }
      
      // PoolStatus enum: Open = 0, Closed = 1, Resolved = 2, Cancelled = 3
      if (Number(pool.status) !== 0) {
        const errorMsg = `Pre-flight failed: Pool ${poolId} is not Open (Current status: ${pool.status.toString()}).`;
        console.error(errorMsg);
        addNotification('error', errorMsg);
        throw new Error(errorMsg);
      }

      const nowInSeconds = Math.floor(Date.now() / 1000);
      if (nowInSeconds >= Number(pool.closingTime)) {
        const errorMsg = `Pre-flight failed: Pool ${poolId} is closed for predictions (closing time passed).`;
        console.error(errorMsg);
        addNotification('error', errorMsg);
        throw new Error(errorMsg);
      }

      // --- 3. PRE-FLIGHT CHECK: Read contract's required bet amount and validate OKB value ---
      // The contract requires msg.value > 0. We validate this and ensure it matches the positive OKB value.
      if (txValue <= 0n) {
        const errorMsg = `Pre-flight failed: Bet amount must be greater than 0 OKB (Sending: ${amount} OKB).`;
        console.error(errorMsg);
        addNotification('error', errorMsg);
        throw new Error(errorMsg);
      }

      // Check user's native OKB balance to verify they have enough funds (bet value + basic gas overhead)
      const signer = await browserProvider.getSigner();
      const userAddress = await signer.getAddress();
      const balance = await browserProvider.getBalance(userAddress);
      if (balance < txValue) {
        const errorMsg = `Insufficient OKB balance. Wallet has: ${ethers.formatEther(balance)} OKB, Need: ${amount} OKB.`;
        console.error(`[PRE-FLIGHT] ${errorMsg}`);
        addNotification('error', `Pre-flight failed: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      // Additional Check: Verify if user already placed a bet and ensure they don't change outcomes
      const userBet = await contract.bets(poolId, userAddress);
      if (userBet.amount > 0n && Number(userBet.outcome) !== Number(outcome)) {
        const errorMsg = `Pre-flight failed: Cannot change prediction outcome side (already bet on Outcome ${userBet.outcome.toString()}).`;
        console.error(errorMsg);
        addNotification('error', errorMsg);
        throw new Error(errorMsg);
      }

      console.log("[PRE-FLIGHT] Pre-flight checks passed successfully.");

      // --- 1. RUN ETH_CALL SIMULATION: Get actual revert reason before sending, and log it clearly ---
      console.log(`[SIMULATION] Simulating placePrediction(${poolId}, ${outcome}) via eth_call...`);
      const txData = {
        from: userAddress,
        to: await contract.getAddress(),
        data: contract.interface.encodeFunctionData("placePrediction", [poolId, outcome]),
        value: txValue
      };

      try {
        await browserProvider.call(txData);
        console.log("[SIMULATION] eth_call simulation succeeded! Transaction is safe to broadcast.");
      } catch (simError) {
        console.error("[SIMULATION] eth_call simulation failed! Revert details:", simError);
        try {
          console.error("[SIMULATION RAW ERROR]", JSON.stringify(simError, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
        } catch {
          console.error("[SIMULATION RAW ERROR]", simError);
        }
        
        // Try decoding simulation error using ethers v6
        let revertReason = "Transaction will revert on-chain";
        let errorData = null;
        if (simError.data) {
          errorData = simError.data;
        } else if (simError.error && simError.error.data) {
          errorData = simError.error.data;
        }
        
        if (errorData && typeof errorData === 'string') {
          try {
            if (errorData.startsWith('0x08c379a0')) {
              const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + errorData.substring(10));
              revertReason = decoded[0];
            } else {
              const parsedError = contract.interface.parseError(errorData);
              if (parsedError) {
                revertReason = `${parsedError.name}(${parsedError.args.join(', ')})`;
              }
            }
          } catch (decodingError) {
            console.warn("Failed to decode simulation error data:", decodingError);
          }
        } else if (simError.reason) {
          revertReason = simError.reason;
        } else if (simError.message) {
          revertReason = simError.message;
        }
        
        const finalSimError = `Simulation failed on-chain: ${revertReason}`;
        addNotification('error', finalSimError);
        throw new Error(finalSimError, { cause: simError });
      }

      // --- 2 & 5. BROADCAST & DECODE CUSTOM ERRORS: Surface and throw the real revert message ---
      console.log("[TRANSACTION] Estimating gas and preparing broadcast options...");
      
      let txOptions = { value: txValue };
      
      // Override fee parameters with legacy gasPrice to avoid wallet EIP-1559 calculation errors on X Layer
      try {
        txOptions = await applyXLayerLegacyFees(browserProvider, txOptions);
        console.log(`[TRANSACTION] Applying legacy type-0 gasPrice override: ${txOptions.gasPrice.toString()} wei`);
      } catch (feeError) {
        console.warn("[TRANSACTION] Failed to fetch fee data for legacy gasPrice override:", feeError);
      }

      let gasLimit;
      try {
        const estimatedGas = await contract.placePrediction.estimateGas(poolId, outcome, txOptions);
        gasLimit = (estimatedGas * 130n) / 100n; // Apply 30% safety buffer for L2 execution stability
        console.log(`[TRANSACTION] Estimated Gas: ${estimatedGas.toString()}. Applying buffered gasLimit: ${gasLimit.toString()}`);
      } catch (estError) {
        console.warn("[TRANSACTION] Failed to estimate gas, letting wallet handle limit:", estError);
      }

      if (gasLimit) txOptions.gasLimit = gasLimit;

      if (gasLimit && txOptions.gasPrice) {
        const requiredBalance = txValue + (gasLimit * txOptions.gasPrice);
        if (balance < requiredBalance) {
          const errorMsg = `Insufficient OKB balance for stake plus gas. Wallet has: ${ethers.formatEther(balance)} OKB, estimated need: ${ethers.formatEther(requiredBalance)} OKB.`;
          console.error(`[PRE-FLIGHT] ${errorMsg}`);
          addNotification('error', `Pre-flight failed: ${errorMsg}`);
          throw new Error(errorMsg);
        }
      }

      addNotification('pending', `Submitting prediction to wallet: ${amount} OKB...`);
      const tx = await contract.placePrediction(poolId, outcome, txOptions);
      addNotification('pending', `Transaction submitted. Awaiting block confirmation...`, tx.hash);

      await tx.wait();
      addNotification('success', `Prediction transaction confirmed!`, tx.hash);
      
      await fetchPredictionPools(true);
      await refreshBalance();
      return true;
    } catch (error) {
      // Decode the error using ethers v6
      let decodedMessage = error.message || "Transaction failed";
      
      let errorData = null;
      if (error.data) {
        errorData = error.data;
      } else if (error.error && error.error.data) {
        errorData = error.error.data;
      } else if (error.receipt && error.receipt.data) {
        errorData = error.receipt.data;
      }
      
      if (errorData && typeof errorData === 'string') {
        try {
          if (errorData.startsWith('0x08c379a0')) {
            const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['string'], '0x' + errorData.substring(10));
            decodedMessage = decoded[0];
          } else {
            const errorContract = await getContract('PredictionPool', false);
            const parsedError = errorContract.interface.parseError(errorData);
            if (parsedError) {
              decodedMessage = `${parsedError.name}(${parsedError.args.join(', ')})`;
            }
          }
        } catch (decodingError) {
          console.warn("Failed to decode transaction execution error:", decodingError);
        }
      } else if (error.reason) {
        decodedMessage = error.reason;
      } else if (error.message && error.message.includes("user rejected")) {
        decodedMessage = "Transaction rejected by user in Web3 wallet.";
      }

      console.error(`[TRANSACTION FAILED] ${decodedMessage}`, error);
      addNotification('error', `Transaction execution failed: ${decodedMessage}`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [walletConnected, walletType, getContract, fetchPredictionPools, refreshBalance, addNotification]);

  /**
   * @notice Cast fan jury vote on-chain on X Layer Testnet
   */
  const castJuryVote = useCallback(async (playId, choice, amount) => {
    if (!walletConnected) {
      addNotification('error', 'Please connect your Web3 wallet to cast a jury vote on-chain.');
      return;
    }

    const txValue = ethers.parseEther(amount.toString());

    await handleContractTx({
      contractType: 'DisputeRegistry',
      method: 'castJuryVote',
      args: [playId, choice],
      value: txValue,
      pendingMsg: `Preparing transaction: cast jury vote...`,
      successMsg: `Jury vote transaction confirmed!`,
      onSuccess: () => fetchDisputes(true)
    });
  }, [walletConnected, fetchDisputes, addNotification, handleContractTx]);

  /**
   * @notice Claim payout for a correctly predicted market
   */
  const claimPayout = useCallback(async (poolId) => {
    if (!walletConnected) {
      addNotification('error', 'Please connect your Web3 wallet to claim payouts on-chain.');
      return;
    }

    await handleContractTx({
      contractType: 'PredictionPool',
      method: 'claimPayout',
      args: [poolId],
      pendingMsg: `Claiming payout for pool ${poolId}...`,
      successMsg: `Payout claimed successfully!`,
      onSuccess: () => fetchPredictionPools(true)
    });
  }, [walletConnected, fetchPredictionPools, handleContractTx, addNotification]);

  /**
   * @notice Claim jury reward share from losing voters
   */
  const claimJuryRewards = useCallback(async (playId) => {
    if (!walletConnected) {
      addNotification('error', 'Please connect your Web3 wallet to claim jury rewards on-chain.');
      return;
    }

    await handleContractTx({
      contractType: 'DisputeRegistry',
      method: 'claimJuryRewards',
      args: [playId],
      pendingMsg: `Claiming jury rewards for play ${playId}...`,
      successMsg: `Jury rewards claimed successfully!`,
      onSuccess: () => fetchDisputes(true)
    });
  }, [walletConnected, fetchDisputes, handleContractTx, addNotification]);

  /**
   * @notice Admin only action to deploy a new prediction pool and matching dispute on-chain
   */
  const createPoolAndDispute = useCallback(async (playId, poolId, question, description, durationSeconds) => {
    if (!walletConnected) {
      addNotification('error', "Wallet must be connected to run admin commands.");
      return false;
    }

    // Step 1: Create the prediction pool on PredictionPool contract
    const poolSuccess = await handleContractTx({
      contractType: 'PredictionPool',
      method: 'createPool',
      args: [poolId, question, durationSeconds],
      pendingMsg: `Creating Prediction Pool #${poolId} on-chain...`,
      successMsg: `Prediction Pool #${poolId} created!`,
      onSuccess: () => fetchPredictionPools(true)
    });

    if (!poolSuccess) return false;

    // Step 2: Create the dispute on DisputeRegistry contract
    const disputeSuccess = await handleContractTx({
      contractType: 'DisputeRegistry',
      method: 'createDispute',
      args: [playId, poolId, description, durationSeconds],
      pendingMsg: `Creating Dispute #${playId} on-chain...`,
      successMsg: `Dispute #${playId} created successfully!`,
      onSuccess: () => fetchDisputes(true)
    });

    return disputeSuccess;
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
