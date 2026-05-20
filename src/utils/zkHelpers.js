import { ethers } from 'ethers';

/**
 * @notice Encodes the public values to match Solidity's abi.encode(uint256, bool)
 * @dev This guarantees that the publicValues bytes payload matches exactly what is expected by ZKVerifier.sol
 * @param playId The ID of the play being disputed.
 * @param isOffside The deterministic AI verdict (true/false).
 */
export const encodePublicValues = (playId, isOffside) => {
  try {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    return coder.encode(['uint256', 'bool'], [playId, isOffside]);
  } catch (error) {
    console.error("Failed to encode ZK public values:", error);
    // Fallback safe manual EVM padding if coder fails
    const paddedPlayId = playId.toString(16).padStart(64, '0');
    const paddedIsOffside = (isOffside ? '1' : '0').padStart(64, '0');
    return `0x${paddedPlayId}${paddedIsOffside}`;
  }
};

/**
 * @notice Generates a mock SP1 PLONK/Groth16 proof parameter payload.
 * @dev In a production environment, this is fetched from a Succinct Prover Network API or Rust daemon.
 */
export const generateMockProofBytes = () => {
  const entropy = new Uint8Array(256);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(entropy);
  } else {
    for (let i = 0; i < entropy.length; i++) {
      entropy[i] = Math.floor(Math.random() * 256);
    }
  }
  return '0x' + Array.from(entropy).map(b => b.toString(16).padStart(8, '0')).join('');
};

/**
 * @notice Simulates SP1 compiler logs for the dashboard.
 */
export const getSP1CompilationLogs = (playId, isOffside) => {
  return [
    `[CARGO] Compiling zk-var-guest v0.1.0 (RISC-V target)...`,
    `[CARGO] Completed compilation in 1.48s (release mode)`,
    `[SP1-ELF] ELF file located at: target/elf-wasm32-unknown-unknown/release/zk-var-guest`,
    `[SP1-VM] Booting SP1 RISC-V executor...`,
    `[SP1-VM] Mapping input bytes: playId = ${playId}, isOffside = ${isOffside}`,
    `[SP1-VM] Executing guest program...`,
    `[SP1-VM] Execution success! Cycles: 284,912`,
    `[SP1-VM] Program outputs match specifications. Generating proof...`
  ];
};
