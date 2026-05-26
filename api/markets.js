import { ethers } from 'ethers';

const CONTRACT_ADDRESSES = {
  DisputeRegistry: process.env.VITE_DISPUTE_REGISTRY_ADDRESS || '0x8a549cbc1447110a7ce5e4f77072cb80b8c240d4',
  PredictionPool: process.env.VITE_PREDICTION_POOL_ADDRESS || '0x359ac1e8a0ce01b002ac4b85802a889ac4d35557'
};

const XLAYER_RPC_URLS = [
  process.env.XLAYER_RPC_URL,
  'https://rpc.xlayer.tech',
  'https://xlayerrpc.okx.com'
].filter(Boolean);

const PREDICTION_POOL_ABI = [
  'function getPoolDetails(uint256 _poolId) view returns (string memory question, uint256 closingTime, uint8 status, uint8 winningOutcome, uint256 totalStaked, uint256 stakedOutcome1, uint256 stakedOutcome2, uint256 resolutionTime)'
];

const DISPUTE_REGISTRY_ABI = [
  'function getDisputeDetails(uint256 _playId) view returns (uint256 predictionPoolId, string memory description, uint256 votingEndTime, uint8 status, uint256 totalJuryStaked, uint256 votesValid, uint256 votesInvalid, uint256 votesInconclusive, uint8 verdict, uint256 resolutionTime)'
];

const jsonResponse = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
};

const formatEtherVal = (val) => {
  if (!val) return '0.00';
  return parseFloat(ethers.formatEther(val)).toFixed(2);
};

const withProviderFallback = async (readFn) => {
  let lastError;

  for (const rpcUrl of XLAYER_RPC_URLS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl, 196, { staticNetwork: true });
      return await readFn(provider);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No X Layer RPC URL configured.');
};

const fetchPools = async (provider) => {
  const contract = new ethers.Contract(CONTRACT_ADDRESSES.PredictionPool, PREDICTION_POOL_ABI, provider);
  const poolIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const pools = await Promise.all(poolIds.map(async (id) => {
    try {
      const details = await contract.getPoolDetails(id);
      const questionText = details[0];
      const closingTime = Number(details[1]);
      if (closingTime === 0 || !questionText?.trim()) return null;

      return {
        poolId: id,
        question: questionText.trim(),
        closingTime,
        status: Number(details[2]),
        winningOutcome: Number(details[3]),
        totalStaked: formatEtherVal(details[4]),
        stakedOutcome1: formatEtherVal(details[5]),
        stakedOutcome2: formatEtherVal(details[6]),
        disputeId: 100 + id
      };
    } catch {
      return null;
    }
  }));

  return pools.filter(Boolean);
};

const fetchDisputes = async (provider) => {
  const contract = new ethers.Contract(CONTRACT_ADDRESSES.DisputeRegistry, DISPUTE_REGISTRY_ABI, provider);
  const disputeIds = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];

  const disputes = await Promise.all(disputeIds.map(async (id) => {
    try {
      const details = await contract.getDisputeDetails(id);
      const poolId = Number(details[0]);
      const descText = details[1];
      const votingEndTime = Number(details[2]);
      if (votingEndTime === 0 || !descText?.trim()) return null;

      return {
        playId: id,
        predictionPoolId: poolId,
        description: descText.trim(),
        votingEndTime,
        status: Number(details[3]),
        totalJuryStaked: formatEtherVal(details[4]),
        votesValid: formatEtherVal(details[5]),
        votesInvalid: formatEtherVal(details[6]),
        votesInconclusive: formatEtherVal(details[7]),
        exists: true,
        verdict: Number(details[8]),
        resolutionTime: Number(details[9])
      };
    } catch {
      return null;
    }
  }));

  return disputes.filter(Boolean);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    jsonResponse(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const payload = await withProviderFallback(async (provider) => ({
      pools: await fetchPools(provider),
      disputes: await fetchDisputes(provider)
    }));

    jsonResponse(res, 200, payload);
  } catch (error) {
    jsonResponse(res, 500, { error: error.message || 'Market read failed.' });
  }
}
