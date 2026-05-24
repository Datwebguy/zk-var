import { ethers } from 'ethers';

/**
 * @notice Encodes the public values to match Solidity's abi.encode(uint256, bool, bytes32)
 * @dev This guarantees that the publicValues bytes payload matches exactly what is expected by ZKVerifier.sol
 * @param playId The ID of the play being disputed.
 * @param isOffside The deterministic AI verdict (true/false).
 * @param dataHash The committed hash of the match/event data used by the SP1 guest.
 */
export const encodePublicValues = (playId, isOffside, dataHash) => {
  try {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return coder.encode(['uint256', 'bool', 'bytes32'], [playId, isOffside, dataHash]);
  } catch (error) {
    console.error("Failed to encode ZK public values:", error);
    // Fallback safe manual EVM padding if coder fails.
    const paddedPlayId = playId.toString(16).padStart(64, '0');
    const paddedIsOffside = (isOffside ? '1' : '0').padStart(64, '0');
    const paddedDataHash = dataHash.replace(/^0x/, '').padStart(64, '0');
    return `0x${paddedPlayId}${paddedIsOffside}${paddedDataHash}`;
  }
};

/**
 * @notice Requests a real proof from a backend prover service.
 * @dev The service must fetch/validate match data, execute the SP1 guest, and return proof bytes.
 */
export const requestZKProof = async ({ playId }) => {
  const proverUrl = import.meta.env.VITE_ZK_PROVER_API_URL || '';
  const proveEndpoint = proverUrl
    ? `${proverUrl.replace(/\/$/, '')}/prove`
    : '/api/prove';

  const response = await fetch(proveEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ playId })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Prover API failed with HTTP ${response.status}`);
  }

  const proof = await response.json();
  const hexPattern = /^0x[0-9a-fA-F]+$/;
  const bytes32Pattern = /^0x[0-9a-fA-F]{64}$/;

  if (typeof proof.isOffside !== 'boolean') {
    throw new Error('Prover API response is missing boolean isOffside.');
  }

  if (!bytes32Pattern.test(proof.dataHash || '')) {
    throw new Error('Prover API response is missing bytes32 dataHash.');
  }

  if (!hexPattern.test(proof.proofBytes || '')) {
    throw new Error('Prover API response is missing hex proofBytes.');
  }

  if (proof.publicValues && !hexPattern.test(proof.publicValues)) {
    throw new Error('Prover API response has invalid publicValues hex.');
  }

  return {
    playId,
    isOffside: proof.isOffside,
    dataHash: proof.dataHash,
    publicValues: proof.publicValues || encodePublicValues(playId, proof.isOffside, proof.dataHash),
    proofBytes: proof.proofBytes
  };
};

/**
 * @notice Builds concise logs for the dashboard using real prover API metadata.
 */
export const getSP1ProofLogs = (playId, proof) => {
  return [
    `[PROVER] Received proof for playId=${playId}.`,
    `[PROVER] Verdict output: isOffside=${proof.isOffside}.`,
    `[PROVER] Match data commitment: ${proof.dataHash}.`,
    `[PROVER] Public values ready for on-chain verification.`
  ];
};
