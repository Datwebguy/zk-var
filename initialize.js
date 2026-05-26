import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { PROVEN_WORLD_CUP_MARKETS } from './src/config/provenMarkets.js';

const loadLocalEnv = () => {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
};

loadLocalEnv();

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const RPC_URL = process.env.RPC_URL || 'https://rpc.xlayer.tech';

if (!PRIVATE_KEY) {
  console.error("PRIVATE_KEY environment variable or .env file entry is missing.");
  process.exit(1);
}

const CONTRACT_ADDRESSES = {
  DisputeRegistry: process.env.VITE_DISPUTE_REGISTRY_ADDRESS,
  PredictionPool: process.env.VITE_PREDICTION_POOL_ADDRESS
};

if (!CONTRACT_ADDRESSES.DisputeRegistry || !CONTRACT_ADDRESSES.PredictionPool) {
  console.error("VITE_DISPUTE_REGISTRY_ADDRESS and VITE_PREDICTION_POOL_ADDRESS are required.");
  process.exit(1);
}

const DISPUTE_REGISTRY_ABI = [
  "function createDispute(uint256 _playId, uint256 _predictionPoolId, string calldata _description, uint256 _durationSeconds) external"
];

const PREDICTION_POOL_ABI = [
  "function createPool(uint256 _poolId, string calldata _question, uint256 _durationSeconds) external"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  
  console.log("Using address:", wallet.address);
  
  const predictionPool = new ethers.Contract(CONTRACT_ADDRESSES.PredictionPool, PREDICTION_POOL_ABI, wallet);
  const disputeRegistry = new ethers.Contract(CONTRACT_ADDRESSES.DisputeRegistry, DISPUTE_REGISTRY_ABI, wallet);
  
  const duration = 90 * 24 * 60 * 60;
  
  for (const market of PROVEN_WORLD_CUP_MARKETS) {
    try {
      console.log(`Creating Prediction Pool ${market.poolId}...`);
      const tx = await predictionPool.createPool(market.poolId, market.question, duration);
      console.log(`Pool ${market.poolId} transaction sent:`, tx.hash);
      await tx.wait();
      console.log(`Pool ${market.poolId} created.`);
    } catch (e) {
      console.error(`Pool ${market.poolId} error:`, e.message);
    }
  }

  for (const market of PROVEN_WORLD_CUP_MARKETS) {
    try {
      console.log(`Creating Dispute ${market.playId}...`);
      const tx = await disputeRegistry.createDispute(market.playId, market.poolId, market.description, duration);
      console.log(`Dispute ${market.playId} transaction sent:`, tx.hash);
      await tx.wait();
      console.log(`Dispute ${market.playId} created.`);
    } catch (e) {
      console.error(`Dispute ${market.playId} error:`, e.message);
    }
  }

  console.log("All done!");
}

main();
