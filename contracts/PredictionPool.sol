// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract PredictionReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

contract PredictionPool is PredictionReentrancyGuard {
    address public owner;
    address public disputeRegistry;

    enum PoolStatus { Open, Closed, Resolved, Cancelled }

    struct Pool {
        uint256 poolId;
        string question;
        uint256 closingTime;
        PoolStatus status;
        uint8 winningOutcome;      // 1 = Yes/Valid, 2 = No/Invalid
        uint256 totalStaked;
        uint256 stakedOutcome1;    // weighted by native OKB
        uint256 stakedOutcome2;    // weighted by native OKB
        bool exists;
        uint256 resolutionTime;    // Timestamp of resolution/cancellation
        uint256 totalClaimed;      // Total claimed rewards/refunds
    }

    struct Bet {
        uint8 outcome;
        uint256 amount;
        bool claimed;
    }

    // poolId => Pool
    mapping(uint256 => Pool) public pools;
    // poolId => user => Bet
    mapping(uint256 => mapping(address => Bet)) public bets;
    // poolId => list of betters
    mapping(uint256 => address[]) public betters;

    event PoolCreated(uint256 indexed poolId, string question, uint256 closingTime);
    event BetPlaced(uint256 indexed poolId, address indexed user, uint8 outcome, uint256 amount);
    event PoolResolved(uint256 indexed poolId, uint8 winningOutcome);
    event PayoutClaimed(uint256 indexed poolId, address indexed user, uint256 amount);
    event RefundClaimed(uint256 indexed poolId, address indexed user, uint256 amount);
    event FundsRecovered(uint256 indexed poolId, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyDisputeRegistry() {
        require(msg.sender == disputeRegistry, "Only Dispute Registry");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setDisputeRegistry(address _disputeRegistry) external onlyOwner {
        disputeRegistry = _disputeRegistry;
    }

    function createPool(
        uint256 _poolId,
        string calldata _question,
        uint256 _durationSeconds
    ) external onlyOwner {
        require(!pools[_poolId].exists, "Pool already exists");

        pools[_poolId] = Pool({
            poolId: _poolId,
            question: _question,
            closingTime: block.timestamp + _durationSeconds,
            status: PoolStatus.Open,
            winningOutcome: 0,
            totalStaked: 0,
            stakedOutcome1: 0,
            stakedOutcome2: 0,
            exists: true,
            resolutionTime: 0,
            totalClaimed: 0
        });

        emit PoolCreated(_poolId, _question, block.timestamp + _durationSeconds);
    }

    /**
     * @notice Places a bet/prediction on a specific outcome (1 or 2) using native OKB.
     * @param _poolId The ID of the prediction pool.
     * @param _outcome The outcome chosen (1 = Yes, 2 = No).
     */
    function placePrediction(uint256 _poolId, uint8 _outcome) external payable {
        Pool storage pool = pools[_poolId];
        require(pool.exists, "Pool does not exist");
        require(pool.status == PoolStatus.Open, "Pool is not open");
        require(block.timestamp < pool.closingTime, "Pool is closed for predictions");
        require(msg.value > 0, "Must bet greater than 0");
        require(_outcome == 1 || _outcome == 2, "Invalid outcome choice");

        Bet storage userBet = bets[_poolId][msg.sender];

        if (userBet.amount == 0) {
            userBet.outcome = _outcome;
            userBet.amount = msg.value;
            betters[_poolId].push(msg.sender);
        } else {
            require(userBet.outcome == _outcome, "Cannot change prediction side, can only increase stake");
            userBet.amount += msg.value;
        }

        pool.totalStaked += msg.value;

        if (_outcome == 1) {
            pool.stakedOutcome1 += msg.value;
        } else {
            pool.stakedOutcome2 += msg.value;
        }

        emit BetPlaced(_poolId, msg.sender, _outcome, msg.value);
    }

    /**
     * @notice Resolves the prediction pool.
     * @dev Only callable by the configured DisputeRegistry contract.
     * @param _poolId The ID of the pool.
     * @param _winningOutcome The winning outcome (1 or 2).
     */
    function resolvePrediction(uint256 _poolId, uint8 _winningOutcome) external onlyDisputeRegistry {
        Pool storage pool = pools[_poolId];
        require(pool.exists, "Pool does not exist");
        require(pool.status == PoolStatus.Open || pool.status == PoolStatus.Closed, "Pool already resolved");
        require(_winningOutcome == 1 || _winningOutcome == 2, "Invalid winning outcome");

        pool.status = PoolStatus.Resolved;
        pool.winningOutcome = _winningOutcome;
        pool.resolutionTime = block.timestamp;

        emit PoolResolved(_poolId, _winningOutcome);
    }

    /**
     * @notice Cancels the prediction pool (e.g. if the match was abandoned or dispute was inconclusive).
     * @param _poolId The ID of the pool.
     */
    function cancelPool(uint256 _poolId) external onlyOwner {
        Pool storage pool = pools[_poolId];
        require(pool.exists, "Pool does not exist");
        require(pool.status != PoolStatus.Resolved, "Cannot cancel resolved pool");

        pool.status = PoolStatus.Cancelled;
        pool.resolutionTime = block.timestamp;
    }

    /**
     * @notice Claims the payout for a winning prediction.
     * @param _poolId The ID of the prediction pool.
     */
    function claimPayout(uint256 _poolId) external nonReentrant {
        Pool storage pool = pools[_poolId];
        require(pool.status == PoolStatus.Resolved, "Pool is not resolved");
        require(block.timestamp <= pool.resolutionTime + 90 days, "Claim period expired");

        Bet storage userBet = bets[_poolId][msg.sender];
        require(userBet.amount > 0, "No prediction placed");
        require(!userBet.claimed, "Payout already claimed");
        require(userBet.outcome == pool.winningOutcome, "Prediction was incorrect");

        uint256 winningTotal = (pool.winningOutcome == 1) ? pool.stakedOutcome1 : pool.stakedOutcome2;
        require(winningTotal > 0, "No winning stakes");

        // Reward calculation: (user_amount / winning_total) * total_staked
        uint256 payout = (userBet.amount * pool.totalStaked) / winningTotal;
        
        userBet.claimed = true;
        pool.totalClaimed += payout;

        (bool success, ) = payable(msg.sender).call{value: payout}("");
        require(success, "Transfer failed");

        emit PayoutClaimed(_poolId, msg.sender, payout);
    }

    /**
     * @notice Allows users to claim a 100% refund if the pool is cancelled or if there are no opponents.
     * @param _poolId The ID of the prediction pool.
     */
    function claimRefund(uint256 _poolId) external nonReentrant {
        Pool storage pool = pools[_poolId];
        require(
            pool.status == PoolStatus.Cancelled || 
            (pool.status == PoolStatus.Resolved && (pool.stakedOutcome1 == 0 || pool.stakedOutcome2 == 0)),
            "Pool is not eligible for refund"
        );
        require(block.timestamp <= pool.resolutionTime + 90 days, "Claim period expired");

        Bet storage userBet = bets[_poolId][msg.sender];
        require(userBet.amount > 0, "No prediction placed");
        require(!userBet.claimed, "Refund already claimed");

        uint256 refundAmount = userBet.amount;
        userBet.claimed = true;
        pool.totalClaimed += refundAmount;

        (bool success, ) = payable(msg.sender).call{value: refundAmount}("");
        require(success, "Transfer failed");

        emit RefundClaimed(_poolId, msg.sender, refundAmount);
    }

    /**
     * @notice Allows owner to recover unclaimed funds after 90 days of pool resolution/cancellation
     * @param _poolId The ID of the pool
     */
    function recoverUnclaimedPoolFunds(uint256 _poolId) external onlyOwner nonReentrant {
        Pool storage pool = pools[_poolId];
        require(pool.exists, "Pool does not exist");
        require(
            pool.status == PoolStatus.Resolved || pool.status == PoolStatus.Cancelled,
            "Pool not resolved yet"
        );
        require(block.timestamp > pool.resolutionTime + 90 days, "Claim period not expired yet");

        uint256 unclaimed = pool.totalStaked - pool.totalClaimed;
        require(unclaimed > 0, "No unclaimed funds remaining");

        pool.totalClaimed = pool.totalStaked; // Mark all as claimed to prevent double recovery

        (bool success, ) = payable(owner).call{value: unclaimed}("");
        require(success, "Recovery transfer failed");

        emit FundsRecovered(_poolId, unclaimed);
    }

    // Helper view function to fetch detailed pool details
    function getPoolDetails(uint256 _poolId) external view returns (
        string memory question,
        uint256 closingTime,
        PoolStatus status,
        uint8 winningOutcome,
        uint256 totalStaked,
        uint256 stakedOutcome1,
        uint256 stakedOutcome2,
        uint256 resolutionTime
    ) {
        Pool memory p = pools[_poolId];
        return (
            p.question,
            p.closingTime,
            p.status,
            p.winningOutcome,
            p.totalStaked,
            p.stakedOutcome1,
            p.stakedOutcome2,
            p.resolutionTime
        );
    }
}
