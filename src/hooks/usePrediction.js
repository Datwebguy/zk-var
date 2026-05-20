import { useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ethers } from 'ethers';
import {
  CONTRACT_ADDRESSES,
  PREDICTION_POOL_ABI,
  DISPUTE_REGISTRY_ABI,
  getWeb3Provider,
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

export const usePrediction = () => {
  const {
    walletConnected,
    addNotification,
    placeLocalPrediction,
    castLocalJuryVote,
    predictionPools,
    disputes,
    setPredictionPools,
    setDisputes
  } = useAppStore();

  const [loading, setLoading] = useState(false);

  // Helper to instantiate active contract instance
  const getContract = useCallback(async (contractType, needsSigner = false) => {
    let provider = null;
    if (walletConnected) {
      provider = getWeb3Provider();
    }
    
    // Fallback to public RPC if no wallet connected or no provider (for read-only queries)
    if (!provider) {
      if (needsSigner) return null;
      provider = new ethers.JsonRpcProvider("https://testrpc.xlayer.tech/terigon");
    }

    const address = CONTRACT_ADDRESSES[contractType];
    const abi = contractType === 'PredictionPool' ? PREDICTION_POOL_ABI : DISPUTE_REGISTRY_ABI;
    
    if (needsSigner) {
      const signer = await provider.getSigner();
      return new ethers.Contract(address, abi, signer);
    } else {
      return new ethers.Contract(address, abi, provider);
    }
  }, [walletConnected]);

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

      // Fetch details for pool 1 and 2 concurrently via Promise.all
      const poolIds = [1, 2];
      const fetchPromises = poolIds.map(async (id) => {
        try {
          const details = await contract.getPoolDetails(id);
          return {
            poolId: id,
            question: details[0],
            closingTime: Number(details[1]),
            status: Number(details[2]),
            winningOutcome: Number(details[3]),
            totalStaked: formatEtherVal(details[4]),
            stakedOutcome1: formatEtherVal(details[5]),
            stakedOutcome2: formatEtherVal(details[6]),
            disputeId: 100 + id,
            match: "Argentina vs France"
          };
        } catch (e) {
          console.warn(`Pool ${id} not found on contract. Initializing with local fallback.`);
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

      // Fetch details for dispute 101 and 102 concurrently via Promise.all
      const disputeIds = [101, 102];
      const fetchPromises = disputeIds.map(async (id) => {
        try {
          const details = await contract.getDisputeDetails(id);
          return {
            playId: id,
            predictionPoolId: Number(details[0]),
            description: details[1],
            votingEndTime: Number(details[2]),
            status: Number(details[3]),
            totalJuryStaked: formatEtherVal(details[4]),
            votesValid: formatEtherVal(details[5]),
            votesInvalid: formatEtherVal(details[6]),
            votesInconclusive: formatEtherVal(details[7]),
            exists: true,
            decisionType: id === 101 ? "Offside Detection" : "Out of Bounds"
          };
        } catch (e) {
          console.warn(`Dispute ${id} not found on contract. Initializing with local fallback.`);
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
      const tx = await contract[method](...args, txOptions);
      addNotification('pending', `Transaction submitted. Awaiting confirmation...`, tx.hash);

      await tx.wait();
      addNotification('success', successMsg, tx.hash);
      
      if (onSuccess) {
        await onSuccess();
      }
      return true;
    } catch (error) {
      console.error(`Transaction execution failed for ${contractType}.${method}:`, error);
      if (onFailure) {
        onFailure();
      }
      addNotification('error', `Transaction failed or rejected. Local state simulated.`);
      return false;
    } finally {
      setLoading(false);
    }
  }, [getContract, addNotification]);

  /**
   * @notice Place prediction on-chain on X Layer Testnet, with safe local state failover
   */
  const placePrediction = useCallback(async (poolId, outcome, amount) => {
    if (!walletConnected) {
      placeLocalPrediction(poolId, outcome, amount);
      addNotification('success', `[DEMO MODE] Prediction placed locally! Stake: ${amount} OKB`);
      return;
    }

    const txValue = ethers.parseEther(amount.toString());
    
    await handleContractTx({
      contractType: 'PredictionPool',
      method: 'placePrediction',
      args: [poolId, outcome],
      value: txValue,
      pendingMsg: `Preparing transaction: predict pool ${poolId}...`,
      successMsg: `Prediction transaction confirmed!`,
      onSuccess: () => fetchPredictionPools(true),
      onFailure: () => {
        placeLocalPrediction(poolId, outcome, amount);
      }
    });
  }, [walletConnected, placeLocalPrediction, fetchPredictionPools, addNotification, handleContractTx]);

  /**
   * @notice Cast fan jury vote on-chain on X Layer Testnet, with safe local state failover
   */
  const castJuryVote = useCallback(async (playId, choice, amount) => {
    if (!walletConnected) {
      castLocalJuryVote(playId, choice, amount);
      addNotification('success', `[DEMO MODE] Jury vote cast locally! Stake: ${amount} OKB`);
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
      onSuccess: () => fetchDisputes(true),
      onFailure: () => {
        castLocalJuryVote(playId, choice, amount);
      }
    });
  }, [walletConnected, castLocalJuryVote, fetchDisputes, addNotification, handleContractTx]);

  /**
   * @notice Claim payout for a correctly predicted market
   */
  const claimPayout = useCallback(async (poolId) => {
    if (!walletConnected) {
      addNotification('success', `[DEMO MODE] Mock payout claimed successfully!`);
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
  }, [walletConnected, fetchPredictionPools, handleContractTx]);

  /**
   * @notice Claim jury reward share from losing voters
   */
  const claimJuryRewards = useCallback(async (playId) => {
    if (!walletConnected) {
      addNotification('success', `[DEMO MODE] Mock jury reward claimed successfully!`);
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
  }, [walletConnected, fetchDisputes, handleContractTx]);

  return {
    loading,
    predictionPools,
    disputes,
    fetchPredictionPools,
    fetchDisputes,
    placePrediction,
    castJuryVote,
    claimPayout,
    claimJuryRewards
  };
};
