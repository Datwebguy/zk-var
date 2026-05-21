import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// Load .env manually if process.env variables are not defined (Node legacy support)
let PRIVATE_KEY = process.env.PRIVATE_KEY;
let RPC_URL = process.env.RPC_URL || "https://testrpc.xlayer.tech/terigon";

if (!PRIVATE_KEY) {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split(/\r?\n/);
      for (const line of lines) {
        const match = line.match(/^\s*PRIVATE_KEY\s*=\s*(.*)\s*$/);
        if (match) {
          PRIVATE_KEY = match[1].trim();
        }
        const rpcMatch = line.match(/^\s*RPC_URL\s*=\s*(.*)\s*$/);
        if (rpcMatch) {
          RPC_URL = rpcMatch[1].trim();
        }
      }
    }
  } catch (e) {
    console.warn("Could not read .env file automatically:", e.message);
  }
}

if (!PRIVATE_KEY) {
  console.error("CRITICAL: PRIVATE_KEY environment variable or .env file entry is missing!");
  process.exit(1);
}

const CONTRACT_ADDRESSES = {
  DisputeRegistry: "0x1F9a7E49D0339A53e47857D0D032121764058eF7",
  PredictionPool: "0x1cFa3a209a85BC7E5731bf160E8E1826A6f7727F"
};

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
  
  const duration = 90 * 24 * 60 * 60; // 90 days
  
  try {
    console.log("Creating Prediction Pool 1...");
    const tx1 = await predictionPool.createPool(1, "Will the VAR check rule Messi's 42nd minute goal OFFSIDE?", duration);
    console.log("Tx 1 sent:", tx1.hash);
    await tx1.wait();
    console.log("Pool 1 created!");
  } catch (e) {
    console.error("Pool 1 error:", e.message);
  }

  try {
    console.log("Creating Prediction Pool 2...");
    const tx2 = await predictionPool.createPool(2, "Was the ball completely out of bounds before Mbappe's assist?", duration);
    console.log("Tx 2 sent:", tx2.hash);
    await tx2.wait();
    console.log("Pool 2 created!");
  } catch (e) {
    console.error("Pool 2 error:", e.message);
  }

  try {
    console.log("Creating Dispute 101...");
    const tx3 = await disputeRegistry.createDispute(101, 1, "Messi 42' - Possible offside detection on run-up.", duration);
    console.log("Tx 3 sent:", tx3.hash);
    await tx3.wait();
    console.log("Dispute 101 created!");
  } catch (e) {
    console.error("Dispute 101 error:", e.message);
  }

  try {
    console.log("Creating Dispute 102...");
    const tx4 = await disputeRegistry.createDispute(102, 2, "Mbappe 68' - Touchline check before final cross.", duration);
    console.log("Tx 4 sent:", tx4.hash);
    await tx4.wait();
    console.log("Dispute 102 created!");
  } catch (e) {
    console.error("Dispute 102 error:", e.message);
  }

  console.log("All done!");
}

main();
