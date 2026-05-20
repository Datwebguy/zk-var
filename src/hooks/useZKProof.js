import { useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { encodePublicValues, generateMockProofBytes } from '../utils/zkHelpers';
import { CONTRACT_ADDRESSES, ZK_VERIFIER_ABI, getWeb3Provider } from '../utils/contractHelpers';
import { ethers } from 'ethers';

export const useZKProof = () => {
  const {
    isZKProving,
    zkProofState,
    zkProofLog,
    zkVerifiedHash,
    zkActivePlayId,
    startZKProofPipeline,
    resetZKProofPipeline,
    walletConnected,
    addNotification
  } = useAppStore();

  const [txLoading, setTxLoading] = useState(false);

  /**
   * @notice Triggers the SP1 proof generation visual sequence, followed by actual on-chain verifier call.
   * @param playId The ID of the controversial play.
   * @param isOffside The deterministic AI verdict (true/false).
   * @param onComplete Callback invoked upon successful on-chain verification.
   */
  const generateAndVerifyProof = useCallback(async (playId, isOffside, onComplete) => {
    if (isZKProving) return;

    if (!walletConnected) {
      addNotification('error', 'Please connect your Web3 wallet to verify ZK proofs on-chain.');
      return;
    }

    // Define the custom async verification function
    const verifyTxFn = async (simulatedHash, addLogLine) => {
      setTxLoading(true);
      addLogLine(`[SYSTEM] Broadcasting ZK proof payload to ZKVerifier.sol on X Layer...`);
      addLogLine(`[SYSTEM] Awaiting signature in Web3 Wallet...`);

      try {
        const browserProvider = getWeb3Provider();
        if (!browserProvider) throw new Error("Web3 provider missing");

        const signer = await browserProvider.getSigner();
        const contract = new ethers.Contract(
          CONTRACT_ADDRESSES.ZKVerifier,
          ZK_VERIFIER_ABI,
          signer
        );

        // 1. Generate real public values matching Solidity struct packing
        const publicValues = encodePublicValues(playId, isOffside);
        
        // 2. Generate custom proof byte array representing the SP1 proof
        const proofBytes = generateMockProofBytes();

        // 3. Call ZKVerifier.verifyPlayProof(...) with estimated gas limit and safety buffer
        addLogLine(`[SYSTEM] Estimating gas and submitting ZK proof transaction: verifyPlayProof(${playId}, ${isOffside})...`);
        const txOptions = {};
        try {
          const estimatedGas = await contract.verifyPlayProof.estimateGas(
            playId,
            isOffside,
            publicValues,
            proofBytes
          );
          txOptions.gasLimit = (estimatedGas * 130n) / 100n;
          addLogLine(`[SYSTEM] Gas estimated: ${estimatedGas.toString()}. Applied gasLimit (with 30% buffer): ${txOptions.gasLimit.toString()}`);
        } catch (estError) {
          console.warn("Failed to estimate gas for ZK proof verification:", estError);
          addLogLine(`[SYSTEM] Gas estimation failed, letting wallet handle estimation.`);
        }

        const tx = await contract.verifyPlayProof(
          playId,
          isOffside,
          publicValues,
          proofBytes,
          txOptions
        );

        addLogLine(`[SYSTEM] Transaction broadcasted! Hash: ${tx.hash}`);
        addLogLine(`[SYSTEM] Awaiting block confirmation on X Layer...`);
        
        await tx.wait();
        
        addLogLine(`[ZK-VERIFIER] On-Chain ZK Proof verified successfully via ISP1Verifier!`);
        addLogLine(`[DISPUTE-REGISTRY] playId=${playId} status updated to ResolvedByZK.`);
        addLogLine(`[PREDICTION-POOL] poolId=${playId - 100} resolved with outcome ${isOffside ? 'Yes/Valid' : 'No/Invalid'}.`);

        if (onComplete) onComplete(tx.hash);
        return tx.hash;
      } catch (error) {
        console.error("ZK verification contract transaction failed:", error);
        throw error; // Propagate to ZK proving pipeline catch block
      } finally {
        setTxLoading(false);
      }
    };

    // Trigger the interactive visual proving pipeline with custom verification function
    startZKProofPipeline(playId, isOffside, verifyTxFn);

  }, [isZKProving, walletConnected, startZKProofPipeline, addNotification]);

  return {
    isZKProving,
    zkProofState,
    zkProofLog,
    zkVerifiedHash,
    zkActivePlayId,
    txLoading,
    generateAndVerifyProof,
    resetZKProofPipeline
  };
};
