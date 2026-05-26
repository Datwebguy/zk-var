import { useCallback, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getSP1ProofLogs, requestZKProof } from '../utils/zkHelpers';
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
    userAddress,
    contractOwner,
    addNotification
  } = useAppStore();

  const [txLoading, setTxLoading] = useState(false);

  const generateAndVerifyProof = useCallback(async (playId, onComplete) => {
    if (isZKProving) return;

    if (!walletConnected) {
      addNotification('error', 'Please connect MetaMask or another injected wallet to verify ZK proofs on-chain.');
      return;
    }

    const isContractOwner = Boolean(
      userAddress &&
      contractOwner &&
      userAddress.toLowerCase() === contractOwner.toLowerCase()
    );

    if (!isContractOwner) {
      addNotification('error', 'Only the contract owner can trigger ZK market resolution from this app.');
      return;
    }

    const proveAndVerifyFn = async (addLogLine) => {
      setTxLoading(true);
      addLogLine('[PROVER] Requesting real SP1 proof from configured prover service...');

      let contract = null;
      try {
        const proof = await requestZKProof({ playId });
        getSP1ProofLogs(playId, proof).forEach(addLogLine);

        const browserProvider = getWeb3Provider(walletType);
        if (!browserProvider) throw new Error('Web3 provider missing.');

        const signer = await browserProvider.getSigner();
        contract = new ethers.Contract(CONTRACT_ADDRESSES.ZKVerifier, ZK_VERIFIER_ABI, signer);

        const committedDataHash = await contract.playDataHashes(playId);
        if (committedDataHash === ethers.ZeroHash) {
          addLogLine('[SYSTEM] Committing match data hash before proof verification...');
          const commitTx = await contract.commitPlayData(playId, proof.dataHash);
          addLogLine(`[SYSTEM] Data commitment broadcasted! Hash: ${commitTx.hash}`);
          await commitTx.wait();
          addLogLine('[SYSTEM] Match data commitment confirmed on X Layer.');
        } else if (committedDataHash.toLowerCase() !== proof.dataHash.toLowerCase()) {
          throw new Error('On-chain play data hash does not match prover output.');
        } else {
          addLogLine('[SYSTEM] Existing on-chain data commitment matches prover output.');
        }

        addLogLine('[SYSTEM] Broadcasting proof payload to ZKVerifier.sol on X Layer...');
        addLogLine('[SYSTEM] Awaiting signature in Web3 wallet...');

        const tx = await contract.verifyPlayProof(
          playId,
          proof.isOffside,
          proof.publicValues,
          proof.proofBytes
        );

        addLogLine(`[SYSTEM] Transaction broadcasted! Hash: ${tx.hash}`);
        addLogLine('[SYSTEM] Awaiting block confirmation on X Layer...');
        await tx.wait();

        addLogLine('[ZK-VERIFIER] On-chain SP1 proof verification succeeded.');
        addLogLine(`[DISPUTE-REGISTRY] playId=${playId} status updated to ResolvedByZK.`);
        addLogLine(`[PREDICTION-POOL] poolId=${playId - 100} resolved with outcome ${proof.isOffside ? 'Yes/Valid' : 'No/Invalid'}.`);

        if (onComplete) onComplete(tx.hash, proof);
        return { txHash: tx.hash, isOffside: proof.isOffside };
      } catch (error) {
        logRpcError('ZK verification contract transaction failed', error);
        throw new Error(decodeContractError(error, contract?.interface), { cause: error });
      } finally {
        setTxLoading(false);
      }
    };

    startZKProofPipeline(playId, proveAndVerifyFn);
  }, [isZKProving, walletConnected, userAddress, contractOwner, walletType, startZKProofPipeline, addNotification]);

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
