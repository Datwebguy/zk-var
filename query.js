import { ethers } from 'ethers';

const RPC_URL = "https://testrpc.xlayer.tech/terigon";
const PREDICTION_POOL_ADDRESS = "0x1cFa3a209a85BC7E5731bf160E8E1826A6f7727F";
const USER_WALLET = "0xd759c0017a1f7fbdaee62a1b943b1ec90a02d0fe";

const PREDICTION_POOL_ABI = [
  "function pools(uint256) view returns (uint256 poolId, string question, uint256 closingTime, uint8 status, uint8 winningOutcome, uint256 totalStaked, uint256 stakedOutcome1, uint256 stakedOutcome2, bool exists, uint256 resolutionTime, uint256 totalClaimed)",
  "function bets(uint256, address) view returns (uint8 outcome, uint256 amount, bool claimed)",
  "function placePrediction(uint256 _poolId, uint8 _outcome) external payable"
];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  try {
    const feeData = await provider.getFeeData();
    console.log(`Gas Price: ${ethers.formatUnits(feeData.gasPrice, 'gwei')} gwei`);
  } catch (e) {
    console.error("Failed to query gas price:", e);
  }

  // Check user balance
  try {
    const balance = await provider.getBalance(USER_WALLET);
    console.log(`User Wallet Balance: ${ethers.formatEther(balance)} OKB`);
  } catch (e) {
    console.error("Failed to get balance:", e);
  }

  const contract = new ethers.Contract(PREDICTION_POOL_ADDRESS, PREDICTION_POOL_ABI, provider);

  // 1. Query Pool 1 details
  try {
    console.log("\n--- Querying Pool 1 details ---");
    const pool = await contract.pools(1);
    console.log("Pool 1 details:");
    console.log("- poolId:", pool.poolId.toString());
    console.log("- status:", pool.status.toString(), pool.status === 0n ? "Open" : pool.status === 1n ? "Closed" : pool.status === 2n ? "Resolved" : "Cancelled");
    console.log("- totalStaked:", ethers.formatEther(pool.totalStaked), "OKB");
  } catch (e) {
    console.error("Failed to query Pool 1:", e);
  }

  // Check if user has an existing bet
  try {
    console.log("\n--- Checking User Bets ---");
    const bet = await contract.bets(1, USER_WALLET);
    console.log("User Bet on Pool 1:");
    console.log("- outcome:", bet.outcome.toString(), bet.outcome === 0 ? "None" : bet.outcome === 1 ? "Outcome 1 (Yes)" : "Outcome 2 (No)");
    console.log("- amount:", ethers.formatEther(bet.amount), "OKB");
    console.log("- claimed:", bet.claimed);
  } catch (e) {
    console.error("Failed to query user bets:", e);
  }

  // 2. Simulate & Estimate Gas
  try {
    console.log("\n--- Estimating Gas for placePrediction(1, 1) ---");
    const txData = {
      from: USER_WALLET,
      to: PREDICTION_POOL_ADDRESS,
      data: "0x32cd69fa00000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001",
      value: ethers.parseEther("0.1")
    };
    
    const estimatedGas = await provider.estimateGas(txData);
    console.log(`Estimated Gas Required: ${estimatedGas.toString()} (${Number(estimatedGas).toString(16)} in hex)`);
    
    // Simulate call to verify the output/revert state
    await provider.call(txData);
    console.log("Simulation succeeded!");
  } catch (error) {
    console.log("Simulation or gas estimation failed! Error details:");
    console.error(error);
  }
}

main();

