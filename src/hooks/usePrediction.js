import { useCallback, useState, useEffect } from 'react';
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
  const [contractOwner, setContractOwner] = useState(null);

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

  // Query contract owner address dynamically
  const fetchContractOwner = useCallback(async () => {
    try {
      const contract = await getContract('PredictionPool');
      if (contract) {
        const owner = await contract.owner();
        setContractOwner(owner);
      }
    } catch (error) {
      console.error("Failed to fetch contract owner address:", error);
    }
  }, [getContract]);

  useEffect(() => {
    fetchContractOwner();
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
      const fallbackQuestions = {
        1: "Will the VAR check rule Messi's 42nd minute goal OFFSIDE?",
        2: "Was the ball completely out of bounds before Mbappe's assist?"
      };
      
      const fetchPromises = poolIds.map(async (id) => {
        try {
          const details = await contract.getPoolDetails(id);
          const questionText = details[0];
          const closingTime = Number(details[1]);

          // If the pool closingTime is 0, it means it doesn't exist on contract
          if (closingTime === 0) {
            // Keep fallback for IDs 1 & 2 even if not on-chain
            if (id <= 2) {
              return {
                poolId: id,
                question: fallbackQuestions[id],
                closingTime: Math.floor(Date.now() / 1000) + (id === 1 ? 1200 : 3600),
                status: 0,
                winningOutcome: 0,
                totalStaked: "0.00",
                stakedOutcome1: "0.00",
                stakedOutcome2: "0.00",
                disputeId: 100 + id,
                match: "Argentina vs France"
              };
            }
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
          if (id <= 2) {
            return {
              poolId: id,
              question: fallbackQuestions[id],
              closingTime: Math.floor(Date.now() / 1000) + (id === 1 ? 1200 : 3600),
              status: 0,
              winningOutcome: 0,
              totalStaked: "0.00",
              stakedOutcome1: "0.00",
              stakedOutcome2: "0.00",
              disputeId: 100 + id,
              match: "Argentina vs France"
            };
          }
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

      // Fetch details for dispute IDs 101 to 110 concurrently
      const disputeIds = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
      const fallbackDescriptions = {
        101: "Messi 42' - Possible offside detection on run-up.",
        102: "Mbappe 68' - Touchline check before final cross."
      };
      
      const fetchPromises = disputeIds.map(async (id) => {
        try {
          const details = await contract.getDisputeDetails(id);
          const poolId = Number(details[0]);
          const descText = details[1];
          const votingEndTime = Number(details[2]);

          // If votingEndTime is 0, it means it doesn't exist on contract
          if (votingEndTime === 0) {
            if (id <= 102) {
              return {
                playId: id,
                predictionPoolId: id - 100,
                description: fallbackDescriptions[id],
                votingEndTime: Math.floor(Date.now() / 1000) + (id === 101 ? 1200 : 3600),
                status: 0,
                totalJuryStaked: "0.00",
                votesValid: "0.00",
                votesInvalid: "0.00",
                votesInconclusive: "0.00",
                exists: true,
                verdict: 0,
                resolutionTime: 0,
                decisionType: id === 101 ? "Offside Detection" : "Out of Bounds"
              };
            }
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
          if (id <= 102) {
            return {
              playId: id,
              predictionPoolId: id - 100,
              description: fallbackDescriptions[id],
              votingEndTime: Math.floor(Date.now() / 1000) + (id === 101 ? 1200 : 3600),
              status: 0,
              totalJuryStaked: "0.00",
              votesValid: "0.00",
              votesInvalid: "0.00",
              votesInconclusive: "0.00",
              exists: true,
              verdict: 0,
              resolutionTime: 0,
              decisionType: id === 101 ? "Offside Detection" : "Out of Bounds"
            };
          }
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
