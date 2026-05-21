import { ethers } from 'ethers';

// These are placeholder addresses that are populated after deployment on X Layer Testnet
export const CONTRACT_ADDRESSES = {
  ZKVerifier: "0x5506A30112A86aEBAAD9bbF2093A4E36eFf89296",
  DisputeRegistry: "0x1F9a7E49D0339A53e47857D0D032121764058eF7",
  PredictionPool: "0x1cFa3a209a85BC7E5731bf160E8E1826A6f7727F"
};

export const XLAYER_CHAIN_ID = 195;
export const XLAYER_RPC_URLS = [
  "https://testrpc.xlayer.tech",
  "https://xlayertestrpc.okx.com"
];

export const ZK_VERIFIER_ABI = [
  "function owner() view returns (address)",
  "function disputeRegistry() view returns (address)",
  "function sp1Verifier() view returns (address)",
  "function programVKey() view returns (bytes32)",
  "function isMockEnabled() view returns (bool)",
  "function verifyPlayProof(uint256 playId, bool isOffside, bytes calldata publicValues, bytes calldata proofBytes) external",
  "function setDisputeRegistry(address _disputeRegistry) external",
  "function updateConfig(address _sp1Verifier, bytes32 _programVKey) external",
  "function toggleMockVerification(bool _enabled) external",
  "event ProofVerified(uint256 indexed playId, bool isOffside, bytes32 programVKey)",
  "event MockVerificationToggled(bool enabled)"
];

export const DISPUTE_REGISTRY_ABI = [
  "function owner() view returns (address)",
  "function zkVerifier() view returns (address)",
  "function predictionPool() view returns (address)",
  "function disputes(uint256) view returns (uint256 playId, uint256 predictionPoolId, string description, uint256 votingEndTime, uint8 status, uint8 zkVerdict, uint256 totalJuryStaked, uint256 votesValid, uint256 votesInvalid, uint256 votesInconclusive, bool exists, uint8 verdict, uint256 resolutionTime, uint256 totalJuryClaimed)",
  "function votes(uint256, address) view returns (uint8 choice, uint256 stake, bool claimed)",
  "function createDispute(uint256 _playId, uint256 _predictionPoolId, string calldata _description, uint256 _durationSeconds) external",
  "function castJuryVote(uint256 _playId, uint8 _choice) external payable",
  "function resolveFromVerifier(uint256 _playId, bool _isOffside) external",
  "function resolveByJuryConsensus(uint256 _playId) external",
  "function claimJuryRewards(uint256 _playId) external",
  "function getDisputeDetails(uint256 _playId) view returns (uint256 predictionPoolId, string memory description, uint256 votingEndTime, uint8 status, uint256 totalJuryStaked, uint256 votesValid, uint256 votesInvalid, uint256 votesInconclusive, uint8 verdict, uint256 resolutionTime)",
  "event DisputeCreated(uint256 indexed playId, string description, uint256 votingEndTime)",
  "event VoteCast(uint256 indexed playId, address indexed voter, uint8 choice, uint256 stake)",
  "event DisputeResolved(uint256 indexed playId, uint8 status, uint8 verdict)"
];

export const PREDICTION_POOL_ABI = [
  "function owner() view returns (address)",
  "function disputeRegistry() view returns (address)",
  "function pools(uint256) view returns (uint256 poolId, string question, uint256 closingTime, uint8 status, uint8 winningOutcome, uint256 totalStaked, uint256 stakedOutcome1, uint256 stakedOutcome2, bool exists, uint256 resolutionTime, uint256 totalClaimed)",
  "function bets(uint256, address) view returns (uint8 outcome, uint256 amount, bool claimed)",
  "function createPool(uint256 _poolId, string calldata _question, uint256 _durationSeconds) external",
  "function placePrediction(uint256 _poolId, uint8 _outcome) external payable",
  "function resolvePrediction(uint256 _poolId, uint8 _winningOutcome) external",
  "function claimPayout(uint256 _poolId) external",
  "function claimRefund(uint256 _poolId) external",
  "function getPoolDetails(uint256 _poolId) view returns (string memory question, uint256 closingTime, uint8 status, uint8 winningOutcome, uint256 totalStaked, uint256 stakedOutcome1, uint256 stakedOutcome2, uint256 resolutionTime)",
  "event PoolCreated(uint256 indexed poolId, string question, uint256 closingTime)",
  "event BetPlaced(uint256 indexed poolId, address indexed user, uint8 outcome, uint256 amount)",
  "event PoolResolved(uint256 indexed poolId, uint8 winningOutcome)"
];

// Helper to check for the active Web3 wallet injector selected by app state.
export const getInjectedProvider = (walletType = '') => {
  if (typeof window !== 'undefined') {
    const ethereumProviders = window.ethereum?.providers || [];

    if (walletType === 'okx') {
      return window.okxwallet || ethereumProviders.find((provider) => provider.isOkxWallet) || null;
    }

    if (walletType === 'metamask') {
      return ethereumProviders.find((provider) => provider.isMetaMask && !provider.isOkxWallet) || window.ethereum || null;
    }

    return ethereumProviders.find((provider) => provider.isMetaMask && !provider.isOkxWallet) || window.ethereum || window.okxwallet || null;
  }

  return null;
};

// Helper to create an ethers v6 BrowserProvider from the selected wallet injector.
export const getWeb3Provider = (walletType = '') => {
  const provider = getInjectedProvider(walletType);
  if (provider) {
    return new ethers.BrowserProvider(provider);
  }
  return null;
};

const safeJson = (value) => {
  try {
    return JSON.stringify(value, (key, nestedValue) => (
      typeof nestedValue === 'bigint' ? nestedValue.toString() : nestedValue
    ), 2);
  } catch {
    return String(value);
  }
};

export const logRpcError = (label, error) => {
  console.error(`[${label}]`, error);
  console.error(`[${label}:json]`, safeJson(error));
  console.error(`[${label}:info]`, error?.info || null);
  console.error(`[${label}:error]`, error?.error || null);
  console.error(`[${label}:cause]`, error?.cause || null);
};

export const isEmptyWalletRpcError = (error) => {
  const code = error?.code ?? error?.error?.code ?? error?.info?.error?.code;
  const message = error?.message ?? error?.error?.message ?? error?.info?.error?.message ?? '';
  const originalError = error?.error?.data?.originalError ?? error?.info?.error?.data?.originalError;

  return (
    code === -32603 ||
    message.includes('-32603') ||
    message.includes('could not coalesce error')
  ) && (!originalError || Object.keys(originalError).length === 0);
};

export const decodeContractError = (error, contractInterface = null) => {
  let errorData = error?.data || error?.error?.data || error?.info?.error?.data || error?.receipt?.data;

  if (errorData && typeof errorData === 'object') {
    errorData = errorData.data || errorData.originalError?.data;
  }

  if (typeof errorData === 'string') {
    try {
      if (errorData.startsWith('0x08c379a0')) {
        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['string'], `0x${errorData.substring(10)}`);
        return decoded[0];
      }

      if (errorData.startsWith('0x4e487b71')) {
        const [panicCode] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], `0x${errorData.substring(10)}`);
        return `Solidity panic: 0x${panicCode.toString(16)}`;
      }

      if (contractInterface) {
        const parsedError = contractInterface.parseError(errorData);
        if (parsedError) {
          return `${parsedError.name}(${parsedError.args.join(', ')})`;
        }
      }
    } catch (decodeError) {
      console.warn("Failed to decode contract error data:", decodeError);
    }
  }

  if (error?.reason) return error.reason;
  if (error?.shortMessage) return error.shortMessage;
  if (error?.message?.includes('user rejected')) return "Transaction rejected by user in Web3 wallet.";
  return error?.message || "Transaction failed";
};

// Simple helper to format hashes nicely: 0x1234...5678
export const truncateAddress = (address) => {
  if (!address) return '';
  return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
};

// Format BigInt values to string representation in ether (e.g. 100000000000000000 -> 0.1)
export const formatEtherVal = (val) => {
  if (!val) return '0.00';
  try {
    return parseFloat(ethers.formatEther(val)).toFixed(2);
  } catch {
    return '0.00';
  }
};
