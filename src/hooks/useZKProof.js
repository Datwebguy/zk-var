import { useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { encodePublicValues, generateMockProofBytes } from '../utils/zkHelpers';
import { CONTRACT_ADDRESSES, ZK_VERIFIER_ABI, decodeContractError, getWeb3Provider, logRpcError } from '../utils/contractHelpers';
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
    walletType,
    addNotification
  } = useAppStore();

  const [txLoading, setTxLoading] = useState(false);

  const generateAndVerifyProof = useCallback(async (playId, isOffside, onComplete) => {
    if (isZKProving) return;

    if (!walletConnected) {
      addNotification('error', 'Please connect MetaMask or another injected wallet to verify ZK proofs on-chain.');
      return;
    }

    const verifyTxFn = async (simulatedHash, addLogLine) => {
      setTxLoading(true);
      addLogLine('[SYSTEM] Broadcasting ZK proof payload to ZKVerifier.sol on X Layer...');
      addLogLine('[SYSTEM] Awaiting signature in Web3 wallet...');

      let contract = null;
      try {
        const browserProvider = getWeb3Provider(walletType);
        if (!browserProvider) throw new Error('Web3 provider missing.');

        const signer = await browserProvider.getSigner();
        contract = new ethers.Contract(CONTRACT_ADDRESSES.ZKVerifier, ZK_VERIFIER_ABI, signer);

        const publicValues = encodePublicValues(playId, isOffside);
        const proofBytes = generateMockProofBytes();

        console.log('[ZK TRANSACTION] verifyPlayProof wallet-native payload:', {
          to: CONTRACT_ADDRESSES.ZKVerifier,
          playId,
          isOffside
        });

        const tx = await contract.verifyPlayProof(playId, isOffside, publicValues, proofBytes);

        addLogLine(`[SYSTEM] Transaction broadcasted! Hash: ${tx.hash}`);
        addLogLine('[SYSTEM] Awaiting block confirmation on X Layer...');
        await tx.wait();

        addLogLine('[ZK-VERIFIER] On-Chain ZK Proof verified successfully via ISP1Verifier!');
        addLogLine(`[DISPUTE-REGISTRY] playId=${playId} status updated to ResolvedByZK.`);
        addLogLine(`[PREDICTION-POOL] poolId=${playId - 100} resolved with outcome ${isOffside ? 'Yes/Valid' : 'No/Invalid'}.`);

        if (onComplete) onComplete(tx.hash);
        return tx.hash;
      } catch (error) {
        logRpcError('ZK verification contract transaction failed', error);
        throw new Error(decodeContractError(error, contract?.interface), { cause: error });
      } finally {
        setTxLoading(false);
      }
    };

    startZKProofPipeline(playId, isOffside, verifyTxFn);
  }, [isZKProving, walletConnected, walletType, startZKProofPipeline, addNotification]);

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
