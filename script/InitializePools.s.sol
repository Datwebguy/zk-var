// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/DisputeRegistry.sol";
import "../contracts/PredictionPool.sol";

contract InitializePoolsScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        address predictionPoolAddress = vm.envAddress("VITE_PREDICTION_POOL_ADDRESS");
        address disputeRegistryAddress = vm.envAddress("VITE_DISPUTE_REGISTRY_ADDRESS");

        vm.startBroadcast(deployerPrivateKey);

        PredictionPool predictionPool = PredictionPool(predictionPoolAddress);
        DisputeRegistry disputeRegistry = DisputeRegistry(disputeRegistryAddress);

        // 1. Create Prediction Pools on-chain
        console.log("Creating Prediction Pool 1...");
        predictionPool.createPool(1, "Will the VAR check rule Messi's 42nd minute goal OFFSIDE?", 90 days);

        console.log("Creating Prediction Pool 2...");
        predictionPool.createPool(2, "Was the ball completely out of bounds before Mbappe's assist?", 90 days);

        // 2. Create Disputes on-chain
        console.log("Creating Dispute 101...");
        disputeRegistry.createDispute(101, 1, "Messi 42' - Possible offside detection on run-up.", 90 days);

        console.log("Creating Dispute 102...");
        disputeRegistry.createDispute(102, 2, "Mbappe 68' - Touchline check before final cross.", 90 days);

        vm.stopBroadcast();
        console.log("Initialization complete!");
    }
}
