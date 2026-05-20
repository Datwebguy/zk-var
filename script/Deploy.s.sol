// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/ZKVerifier.sol";
import "../contracts/DisputeRegistry.sol";
import "../contracts/PredictionPool.sol";

contract DeployScript is Script {
    function run() external {
        // Retrieve private key from environmental variables
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        vm.startBroadcast(deployerPrivateKey);

        // Official SP1 Verifier address on X Layer Testnet
        address sp1Verifier = 0x3f62cD685a62CFc27b0D627Fde3c613e5e29699A;
        bytes32 programVKey = 0x0000000000000000000000000000000000000000000000000000000000000000;

        // 1. Deploy ZKVerifier
        ZKVerifier zkVerifier = new ZKVerifier(sp1Verifier, programVKey);
        console.log("ZKVerifier deployed at:", address(zkVerifier));

        // 2. Deploy DisputeRegistry
        DisputeRegistry disputeRegistry = new DisputeRegistry();
        console.log("DisputeRegistry deployed at:", address(disputeRegistry));

        // 3. Deploy PredictionPool
        PredictionPool predictionPool = new PredictionPool();
        console.log("PredictionPool deployed at:", address(predictionPool));

        // 4. Link PredictionPool to DisputeRegistry
        predictionPool.setDisputeRegistry(address(disputeRegistry));
        console.log("DisputeRegistry linked in PredictionPool.");

        // 5. Configure DisputeRegistry with Verifier and Pool
        disputeRegistry.setAddresses(address(zkVerifier), address(predictionPool));
        console.log("Addresses configured in DisputeRegistry.");

        // 6. Configure ZKVerifier with DisputeRegistry
        zkVerifier.setDisputeRegistry(address(disputeRegistry));
        console.log("DisputeRegistry linked in ZKVerifier.");

        vm.stopBroadcast();
    }
}
