// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

abstract contract DisputeReentrancyGuard {
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

interface IPredictionPool {
    function resolvePrediction(uint256 playId, uint8 winningOutcome) external;
}

contract DisputeRegistry is DisputeReentrancyGuard {
    address public owner;
    address public zkVerifier;
    address public predictionPool;

    enum DisputeStatus { Active, VotingClosed, ResolvedByZK, ResolvedByJury }
    enum VoteChoice { None, Valid, Invalid, Inconclusive }

    struct Dispute {
        uint256 playId;
        uint256 predictionPoolId;
        string description;
        uint256 votingEndTime;
        DisputeStatus status;
        VoteChoice zkVerdict;
        uint256 totalJuryStaked;
        uint256 votesValid;       // weighted by staked OKB
        uint256 votesInvalid;     // weighted by staked OKB
        uint256 votesInconclusive;// weighted by staked OKB
        bool exists;
        VoteChoice verdict;       // Final finalized verdict
        uint256 resolutionTime;   // Resolution timestamp
        uint256 totalJuryClaimed;  // Total rewards claimed so far
    }

    struct Vote {
        VoteChoice choice;
        uint256 stake;
        bool claimed;
    }

    // playId => Dispute
    mapping(uint256 => Dispute) public disputes;
    // playId => voterAddress => Vote
    mapping(uint256 => mapping(address => Vote)) public votes;
    // playId => array of voters
    mapping(uint256 => address[]) public voters;

    event DisputeCreated(uint256 indexed playId, string description, uint256 votingEndTime);
    event VoteCast(uint256 indexed playId, address indexed voter, VoteChoice choice, uint256 stake);
    event DisputeResolved(uint256 indexed playId, DisputeStatus status, VoteChoice verdict);
    event RewardsClaimed(uint256 indexed playId, address indexed voter, uint256 amount);
    event VerdictFinalized(uint256 indexed disputeId, VoteChoice verdict, address indexed resolvedBy);
    event FundsRecovered(uint256 indexed playId, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyVerifier() {
        require(msg.sender == zkVerifier, "Only ZK Verifier");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function setAddresses(address _zkVerifier, address _predictionPool) external onlyOwner {
        zkVerifier = _zkVerifier;
        predictionPool = _predictionPool;
    }

    function createDispute(
        uint256 _playId,
        uint256 _predictionPoolId,
        string calldata _description,
        uint256 _durationSeconds
    ) external onlyOwner {
        require(!disputes[_playId].exists, "Dispute already exists");
        
        disputes[_playId] = Dispute({
            playId: _playId,
            predictionPoolId: _predictionPoolId,
            description: _description,
            votingEndTime: block.timestamp + _durationSeconds,
            status: DisputeStatus.Active,
            zkVerdict: VoteChoice.None,
            totalJuryStaked: 0,
            votesValid: 0,
            votesInvalid: 0,
            votesInconclusive: 0,
            exists: true,
            verdict: VoteChoice.None,
            resolutionTime: 0,
            totalJuryClaimed: 0
        });

        emit DisputeCreated(_playId, _description, block.timestamp + _durationSeconds);
    }

    /**
     * @notice Allows a fan to vote on a disputed play by staking native OKB.
     * @param _playId The ID of the play.
     * @param _choice The vote choice (1 = Valid/Offside, 2 = Invalid/No Offside, 3 = Inconclusive).
     */
    function castJuryVote(uint256 _playId, uint8 _choice) external payable {
        Dispute storage dispute = disputes[_playId];
        require(dispute.exists, "Dispute does not exist");
        require(dispute.status == DisputeStatus.Active, "Voting is not active");
        require(block.timestamp < dispute.votingEndTime, "Voting period ended");
        require(msg.value > 0, "Must stake OKB to vote");
        require(_choice >= 1 && _choice <= 3, "Invalid vote choice");

        Vote storage userVote = votes[_playId][msg.sender];
        VoteChoice choice = VoteChoice(_choice);

        if (userVote.choice == VoteChoice.None) {
            userVote.choice = choice;
            userVote.stake = msg.value;
            voters[_playId].push(msg.sender);
        } else {
            require(userVote.choice == choice, "Cannot change vote choice, can only add stake");
            userVote.stake += msg.value;
        }

        dispute.totalJuryStaked += msg.value;

        if (choice == VoteChoice.Valid) {
            dispute.votesValid += msg.value;
        } else if (choice == VoteChoice.Invalid) {
            dispute.votesInvalid += msg.value;
        } else if (choice == VoteChoice.Inconclusive) {
            dispute.votesInconclusive += msg.value;
        }

        emit VoteCast(_playId, msg.sender, choice, msg.value);
    }

    /**
     * @notice Resolves the dispute using a verified SP1 proof from the ZKVerifier.
     * @dev Only callable by the ZKVerifier contract. Overrides any ongoing fan voting.
     * @param _playId The ID of the play.
     * @param _isOffside The verified referee-review result.
     */
    function resolveFromVerifier(uint256 _playId, bool _isOffside) external onlyVerifier {
        Dispute storage dispute = disputes[_playId];
        require(dispute.exists, "Dispute does not exist");
        require(
            dispute.status == DisputeStatus.Active || dispute.status == DisputeStatus.VotingClosed,
            "Dispute already resolved"
        );

        VoteChoice finalVerdict = _isOffside ? VoteChoice.Valid : VoteChoice.Invalid;
        dispute.status = DisputeStatus.ResolvedByZK;
        dispute.zkVerdict = finalVerdict;
        dispute.verdict = finalVerdict;
        dispute.resolutionTime = block.timestamp;

        emit DisputeResolved(_playId, DisputeStatus.ResolvedByZK, finalVerdict);
        emit VerdictFinalized(_playId, finalVerdict, msg.sender);

        // Map the verdict to PredictionPool outcomes.
        // 1 = Valid/Yes (e.g. Offside happened), 2 = Invalid/No
        uint8 winningOutcome = _isOffside ? 1 : 2;

        // Resolve the prediction pool associated with this dispute.
        if (predictionPool != address(0)) {
            IPredictionPool(predictionPool).resolvePrediction(dispute.predictionPoolId, winningOutcome);
        }
    }

    /**
     * @notice Fallback resolution based purely on weighted jury consensus if no ZK proof is submitted.
     * @param _playId The ID of the play.
     */
    function resolveByJuryConsensus(uint256 _playId) external {
        Dispute storage dispute = disputes[_playId];
        require(dispute.exists, "Dispute does not exist");
        require(dispute.status == DisputeStatus.Active, "Already resolved");
        require(block.timestamp >= dispute.votingEndTime, "Voting is still open");

        VoteChoice finalVerdict;
        if (dispute.votesValid > dispute.votesInvalid && dispute.votesValid > dispute.votesInconclusive) {
            finalVerdict = VoteChoice.Valid;
        } else if (dispute.votesInvalid > dispute.votesValid && dispute.votesInvalid > dispute.votesInconclusive) {
            finalVerdict = VoteChoice.Invalid;
        } else {
            finalVerdict = VoteChoice.Inconclusive;
        }

        dispute.status = DisputeStatus.ResolvedByJury;
        dispute.verdict = finalVerdict;
        dispute.resolutionTime = block.timestamp;

        emit DisputeResolved(_playId, DisputeStatus.ResolvedByJury, finalVerdict);
        emit VerdictFinalized(_playId, finalVerdict, msg.sender);

        uint8 winningOutcome = (finalVerdict == VoteChoice.Valid) ? 1 : 2;

        if (predictionPool != address(0) && finalVerdict != VoteChoice.Inconclusive) {
            IPredictionPool(predictionPool).resolvePrediction(dispute.predictionPoolId, winningOutcome);
        }
    }

    /**
     * @notice Allows jury members who voted for the winning outcome to claim their share of the losing jury stakes.
     * @param _playId The ID of the play.
     */
    function claimJuryRewards(uint256 _playId) external nonReentrant {
        Dispute storage dispute = disputes[_playId];
        require(
            dispute.status == DisputeStatus.ResolvedByZK || dispute.status == DisputeStatus.ResolvedByJury,
            "Dispute not resolved yet"
        );

        Vote storage userVote = votes[_playId][msg.sender];
        require(userVote.stake > 0, "No stake in this dispute");
        require(!userVote.claimed, "Rewards already claimed");

        // Enforce 90-day claim deadline
        require(block.timestamp <= dispute.resolutionTime + 90 days, "Claim period expired");

        VoteChoice winningChoice = dispute.verdict;
        uint256 winningWeight = 0;
        if (winningChoice == VoteChoice.Valid) {
            winningWeight = dispute.votesValid;
        } else if (winningChoice == VoteChoice.Invalid) {
            winningWeight = dispute.votesInvalid;
        } else if (winningChoice == VoteChoice.Inconclusive) {
            winningWeight = dispute.votesInconclusive;
        }

        uint256 payoutAmount;
        if (winningChoice == VoteChoice.Inconclusive || winningWeight == 0) {
            payoutAmount = userVote.stake;
        } else {
            require(userVote.choice == winningChoice, "Voted for the losing verdict");
            payoutAmount = (userVote.stake * dispute.totalJuryStaked) / winningWeight;
        }

        userVote.claimed = true;
        dispute.totalJuryClaimed += payoutAmount;

        (bool success, ) = payable(msg.sender).call{value: payoutAmount}("");
        require(success, "Transfer failed");

        emit RewardsClaimed(_playId, msg.sender, payoutAmount);
    }

    /**
     * @notice Allows owner to recover unclaimed funds after 90 days of dispute resolution
     * @param _playId The ID of the play
     */
    function recoverUnclaimedJuryFunds(uint256 _playId) external onlyOwner nonReentrant {
        Dispute storage dispute = disputes[_playId];
        require(dispute.exists, "Dispute does not exist");
        require(
            dispute.status == DisputeStatus.ResolvedByZK || dispute.status == DisputeStatus.ResolvedByJury,
            "Dispute not resolved yet"
        );
        require(block.timestamp > dispute.resolutionTime + 90 days, "Claim period not expired yet");
        
        uint256 unclaimed = dispute.totalJuryStaked - dispute.totalJuryClaimed;
        require(unclaimed > 0, "No unclaimed funds remaining");

        dispute.totalJuryClaimed = dispute.totalJuryStaked;

        (bool success, ) = payable(owner).call{value: unclaimed}("");
        require(success, "Recovery transfer failed");

        emit FundsRecovered(_playId, unclaimed);
    }

    function getDisputeDetails(uint256 _playId) external view returns (
        uint256 predictionPoolId,
        string memory description,
        uint256 votingEndTime,
        DisputeStatus status,
        uint256 totalJuryStaked,
        uint256 votesValid,
        uint256 votesInvalid,
        uint256 votesInconclusive,
        VoteChoice verdict,
        uint256 resolutionTime
    ) {
        Dispute memory d = disputes[_playId];
        return (
            d.predictionPoolId,
            d.description,
            d.votingEndTime,
            d.status,
            d.totalJuryStaked,
            d.votesValid,
            d.votesInvalid,
            d.votesInconclusive,
            d.verdict,
            d.resolutionTime
        );
    }
}
