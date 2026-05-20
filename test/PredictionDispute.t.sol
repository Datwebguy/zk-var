// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../contracts/DisputeRegistry.sol";
import "../contracts/PredictionPool.sol";
import "../contracts/ZKVerifier.sol";

// Malicious contract to attempt reentrancy on claimJuryRewards
contract MaliciousJuryAttacker {
    DisputeRegistry public registry;
    uint256 public playId;
    uint256 public attackCount;

    constructor(DisputeRegistry _registry, uint256 _playId) {
        registry = _registry;
        playId = _playId;
    }

    function attack() external payable {
        // Vote first so we have a stake
        registry.castJuryVote{value: msg.value}(playId, 1); // Vote Valid
    }

    function triggerClaim() external {
        registry.claimJuryRewards(playId);
    }

    receive() external payable {
        if (attackCount < 2) {
            attackCount++;
            registry.claimJuryRewards(playId);
        }
    }
}

// Malicious contract to attempt reentrancy on claimPayout
contract MaliciousPoolAttacker {
    PredictionPool public pool;
    uint256 public poolId;
    uint256 public attackCount;

    constructor(PredictionPool _pool, uint256 _poolId) {
        pool = _pool;
        poolId = _poolId;
    }

    function attack() external payable {
        pool.placePrediction{value: msg.value}(poolId, 1);
    }

    function triggerClaim() external {
        pool.claimPayout(poolId);
    }

    receive() external payable {
        if (attackCount < 2) {
            attackCount++;
            pool.claimPayout(poolId);
        }
    }
}

contract PredictionDisputeTest is Test {
    DisputeRegistry public disputeRegistry;
    PredictionPool public predictionPool;
    ZKVerifier public zkVerifier;

    address public owner = address(10);
    address public alice = address(11);
    address public bob = address(12);
    address public charlie = address(13);
    address public dave = address(14);

    function setUp() public {
        vm.startPrank(owner);

        // Deploy contracts
        zkVerifier = new ZKVerifier(address(0x123), bytes32(0));
        disputeRegistry = new DisputeRegistry();
        predictionPool = new PredictionPool();

        // Connect contracts
        predictionPool.setDisputeRegistry(address(disputeRegistry));
        disputeRegistry.setAddresses(address(zkVerifier), address(predictionPool));
        zkVerifier.setDisputeRegistry(address(disputeRegistry));

        vm.stopPrank();

        // Fund test addresses
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
        vm.deal(dave, 100 ether);
    }

    // A. Inconclusive verdict triggers 100% stake refund
    function testInconclusiveVerdictRefund() public {
        uint256 playId = 101;
        uint256 poolId = 1;

        vm.prank(owner);
        disputeRegistry.createDispute(playId, poolId, "Controversial play", 1 hours);

        // Alice, Bob, and Charlie vote with different stakes
        vm.prank(alice);
        disputeRegistry.castJuryVote{value: 1 ether}(playId, 1); // Valid

        vm.prank(bob);
        disputeRegistry.castJuryVote{value: 2 ether}(playId, 2); // Invalid

        vm.prank(charlie);
        disputeRegistry.castJuryVote{value: 3 ether}(playId, 3); // Inconclusive (leads or ties)

        // Move time past voting end time
        vm.warp(block.timestamp + 2 hours);

        // Resolve by consensus -> Inconclusive should win due to tie/lead rules
        disputeRegistry.resolveByJuryConsensus(playId);

        // Check balances before claims
        uint256 aliceBalBefore = alice.balance;
        uint256 bobBalBefore = bob.balance;
        uint256 charlieBalBefore = charlie.balance;

        // Everyone claims rewards (which should be 100% refunds since it's inconclusive)
        vm.prank(alice);
        disputeRegistry.claimJuryRewards(playId);

        vm.prank(bob);
        disputeRegistry.claimJuryRewards(playId);

        vm.prank(charlie);
        disputeRegistry.claimJuryRewards(playId);

        // Verify that everyone got their exact stake back
        assertEq(alice.balance - aliceBalBefore, 1 ether);
        assertEq(bob.balance - bobBalBefore, 2 ether);
        assertEq(charlie.balance - charlieBalBefore, 3 ether);
    }

    // B. Reentrancy attack attempt on claimJuryRewards() must revert
    function testReentrancyClaimJuryRewardsReverts() public {
        uint256 playId = 101;
        uint256 poolId = 1;

        vm.prank(owner);
        predictionPool.createPool(poolId, "Will Messi score?", 1 hours);

        vm.prank(owner);
        disputeRegistry.createDispute(playId, poolId, "Controversial play", 1 hours);

        // Have a normal user vote Valid so there's some pool weight
        vm.prank(alice);
        disputeRegistry.castJuryVote{value: 5 ether}(playId, 1);

        // Attack contract stakes 1 ether on Valid
        MaliciousJuryAttacker attacker = new MaliciousJuryAttacker(disputeRegistry, playId);
        vm.deal(address(attacker), 10 ether);
        
        vm.prank(address(attacker));
        attacker.attack{value: 1 ether}();

        // Warp and resolve to Valid
        vm.warp(block.timestamp + 2 hours);
        disputeRegistry.resolveByJuryConsensus(playId);

        // Attempting to claim rewards through attacker should trigger reentrancy and fail
        vm.expectRevert();
        attacker.triggerClaim();
    }

    // B. Reentrancy attack attempt on claimPayout() must revert
    function testReentrancyClaimPayoutReverts() public {
        uint256 poolId = 1;

        vm.prank(owner);
        predictionPool.createPool(poolId, "Will Messi score?", 1 hours);

        // Alice places regular prediction
        vm.prank(alice);
        predictionPool.placePrediction{value: 5 ether}(poolId, 1);

        // Attacker places prediction on same side
        MaliciousPoolAttacker attacker = new MaliciousPoolAttacker(predictionPool, poolId);
        vm.deal(address(attacker), 10 ether);
        
        vm.prank(address(attacker));
        attacker.attack{value: 1 ether}();

        // Also place some bet on the losing side so there is a pool to claim
        vm.prank(bob);
        predictionPool.placePrediction{value: 4 ether}(poolId, 2);

        // Mock resolve pool through dispute registry manually
        vm.prank(owner);
        disputeRegistry.createDispute(101, poolId, "Resolve", 1 hours);

        vm.warp(block.timestamp + 2 hours);
        
        // Resolve pool to outcome 1
        vm.prank(address(zkVerifier));
        disputeRegistry.resolveFromVerifier(101, true); // resolves play to Valid, pool to 1

        // Attempting to claim payout through attacker should trigger reentrancy and fail
        vm.expectRevert();
        attacker.triggerClaim();
    }

    // C. Proportional payout math correctness with at least 3 different stake ratios
    function testProportionalPayoutMath() public {
        uint256 playId = 101;
        uint256 poolId = 1;

        vm.prank(owner);
        predictionPool.createPool(poolId, "Will Messi score?", 1 hours);

        vm.prank(owner);
        disputeRegistry.createDispute(playId, poolId, "Controversial play", 1 hours);

        // Stake Ratios:
        // Alice: 1 ether
        // Bob: 2 ether
        // Charlie: 3 ether
        // Total Winning Weight = 6 ether
        // Dave (losing side): 4 ether
        // Total Pool = 10 ether

        vm.prank(alice);
        disputeRegistry.castJuryVote{value: 1 ether}(playId, 1); // Valid

        vm.prank(bob);
        disputeRegistry.castJuryVote{value: 2 ether}(playId, 1); // Valid

        vm.prank(charlie);
        disputeRegistry.castJuryVote{value: 3 ether}(playId, 1); // Valid

        vm.prank(dave);
        disputeRegistry.castJuryVote{value: 4 ether}(playId, 2); // Invalid

        // Warp and resolve Valid
        vm.warp(block.timestamp + 2 hours);
        disputeRegistry.resolveByJuryConsensus(playId);

        // Check balances before claims
        uint256 aliceBalBefore = alice.balance;
        uint256 bobBalBefore = bob.balance;
        uint256 charlieBalBefore = charlie.balance;

        // Claim
        vm.prank(alice);
        disputeRegistry.claimJuryRewards(playId);

        vm.prank(bob);
        disputeRegistry.claimJuryRewards(playId);

        vm.prank(charlie);
        disputeRegistry.claimJuryRewards(playId);

        // Verify Proportional payouts:
        // Alice should receive: (1 * 10) / 6 = 1.6666... ether
        // Bob should receive: (2 * 10) / 6 = 3.3333... ether
        // Charlie should receive: (3 * 10) / 6 = 5 ether
        uint256 divisor = 6;
        uint256 expectedAlice = (1 ether * 10) / divisor;
        uint256 expectedBob = (2 ether * 10) / divisor;
        uint256 expectedCharlie = 5 ether;

        assertEq(alice.balance - aliceBalBefore, expectedAlice);
        assertEq(bob.balance - bobBalBefore, expectedBob);
        assertEq(charlie.balance - charlieBalBefore, expectedCharlie);
    }

    // D. claimDeadline enforcement — claim after 90 days must revert, owner recovery recovers remainder
    function testClaimDeadlineEnforcement() public {
        uint256 playId = 101;
        uint256 poolId = 1;

        vm.prank(owner);
        disputeRegistry.createDispute(playId, poolId, "Controversial play", 1 hours);

        vm.prank(alice);
        disputeRegistry.castJuryVote{value: 5 ether}(playId, 1); // Valid

        vm.prank(bob);
        disputeRegistry.castJuryVote{value: 5 ether}(playId, 2); // Invalid

        // Warp and resolve Valid
        vm.warp(block.timestamp + 2 hours);
        disputeRegistry.resolveByJuryConsensus(playId);

        // Fast forward 91 days
        vm.warp(block.timestamp + 91 days);

        // Alice claims rewards -> should revert
        vm.prank(alice);
        vm.expectRevert("Claim period expired");
        disputeRegistry.claimJuryRewards(playId);

        // Owner claws back funds
        uint256 ownerBalBefore = owner.balance;
        
        vm.prank(owner);
        disputeRegistry.recoverUnclaimedJuryFunds(playId);

        // Unclaimed jury funds = 10 ether total. All 10 ether should be returned to owner.
        assertEq(owner.balance - ownerBalBefore, 10 ether);
    }
}
