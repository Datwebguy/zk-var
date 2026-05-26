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

        console.log("Creating Prediction Pool 3...");
        predictionPool.createPool(3, "Will Mexico vs South Africa include a VAR-confirmed offside decision?", 90 days);

        console.log("Creating Prediction Pool 4...");
        predictionPool.createPool(4, "Will Mexico vs South Africa have a goal disallowed after VAR review?", 90 days);

        console.log("Creating Prediction Pool 5...");
        predictionPool.createPool(5, "Will Mexico vs South Africa include a penalty decision reviewed by VAR?", 90 days);

        console.log("Creating Prediction Pool 6...");
        predictionPool.createPool(6, "Will Mexico vs South Africa include a red-card VAR review?", 90 days);

        console.log("Creating Prediction Pool 7...");
        predictionPool.createPool(7, "Will Mexico vs South Africa include two or more VAR reviews?", 90 days);

        console.log("Creating Dispute 103...");
        disputeRegistry.createDispute(103, 3, "Opening match market. Resolves YES if the official match event feed includes a VAR-confirmed offside decision; otherwise resolves NO.", 90 days);

        console.log("Creating Dispute 104...");
        disputeRegistry.createDispute(104, 4, "Opening match market. Resolves YES if the official match event feed records a goal disallowed, cancelled, or overturned after VAR review; otherwise resolves NO.", 90 days);

        console.log("Creating Dispute 105...");
        disputeRegistry.createDispute(105, 5, "Opening match market. Resolves YES if the official match event feed records a penalty awarded, cancelled, confirmed, or reviewed by VAR; otherwise resolves NO.", 90 days);

        console.log("Creating Dispute 106...");
        disputeRegistry.createDispute(106, 6, "Opening match market. Resolves YES if the official match event feed records a red-card or serious-foul review by VAR; otherwise resolves NO.", 90 days);

        console.log("Creating Dispute 107...");
        disputeRegistry.createDispute(107, 7, "Opening match market. Resolves YES if the official match event feed records at least two VAR review events; otherwise resolves NO.", 90 days);

        vm.stopBroadcast();
        console.log("Initialization complete!");
    }
}
