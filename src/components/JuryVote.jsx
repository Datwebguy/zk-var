import { useState } from 'react';
import { usePrediction } from '../hooks/usePrediction';
import { useZKProof } from '../hooks/useZKProof';
import { useWallet } from '../hooks/useWallet';
import { Shield, Sparkles, Scale, Info, HelpCircle } from 'lucide-react';

export const JuryVote = ({ activePlayId = 101 }) => {
  const { disputes, castJuryVote, claimJuryRewards, loading } = usePrediction();
  const { generateAndVerifyProof, isZKProving, txLoading } = useZKProof();
  const { walletConnected, balance, connectWallet } = useWallet();

  const [voteChoice, setVoteChoice] = useState(1); // Default to Choice 1: Valid
  const [stakeAmount, setStakeAmount] = useState('0.25'); // Default stake of 0.25 OKB

  const dispute = disputes.find(d => d.playId === activePlayId) || disputes[0];

  const userStake = parseFloat(stakeAmount) || 0.0;
  const userBalance = walletConnected ? parseFloat(balance) || 0 : 0.0;
  const isInsufficientBalance = walletConnected && (userStake > userBalance);

  const handleCastVote = async () => {
    if (!walletConnected) {
      await connectWallet('metamask');
      return;
    }
    if (isInsufficientBalance) return;
    await castJuryVote(activePlayId, voteChoice, stakeAmount);
  };

  const handleTriggerZK = () => {
    // Determine the verified output dynamically based on playId (101 is Offside, 102 is Touchline valid/invalid)
    const isOffsideVerdict = activePlayId === 101;
    generateAndVerifyProof(activePlayId, isOffsideVerdict);
  };

  // Convert status code to readable badge text
  const getStatusText = (status) => {
    switch (status) {
      case 0: return 'ACTIVE';
      case 1: return 'VOTING_CLOSED';
      case 2: return 'ZK_VERIFIED';
      case 3: return 'JURY_RESOLVED';
      default: return 'ACTIVE';
    }
  };

  if (!dispute) {
    return (
      <div className="glass-panel p-6 bg-[#121214]/40 flex flex-col items-center justify-center text-center min-h-[340px] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00F5FF]/5 to-transparent pointer-events-none" />
        <Scale size={48} className="text-zinc-600 mb-4 animate-pulse" />
        <h3 className="font-heading font-bold text-lg text-white mb-2">No Active Tribunal Cases</h3>
        <p className="text-xs text-zinc-500 font-mono max-w-sm leading-normal mb-6">
          Awaiting new play reviews or active dispute registry records from the X Layer smart contracts. Connect your wallet to deploy a custom match case.
        </p>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-950/60 border border-zinc-800 text-glow-cyan text-[#00F5FF] text-2xs font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00F5FF] animate-ping" />
          <span>LISTENING TO X LAYER TESTNET</span>
        </div>
      </div>
    );
  }

  const isClosed = dispute.status !== 0;

  return (
    <div className="glass-panel p-6 bg-[#121214]/40 flex flex-col md:flex-row gap-6 relative overflow-hidden">
      
      {/* Background Grid Accent overlay */}
      <div className="absolute right-0 top-0 w-24 h-full bg-gradient-to-l from-[#A8FF35]/5 to-transparent pointer-events-none" />

      {/* 1. Left side: Jury status & vote form */}
      <div className="flex-1 flex flex-col justify-between gap-5">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="hud-label"><Scale size={14} className="text-[#A8FF35]" /> Fan Jury Court</span>
            <span className={`status-badge ${dispute.status === 2 ? 'resolved' : 'active'}`}>
              {getStatusText(dispute.status)}
            </span>
          </div>
          <h3 className="font-heading font-bold text-lg text-white mb-2 leading-snug">
            {dispute.description}
          </h3>
          <p className="text-xs text-zinc-500 font-mono">
            {isClosed 
              ? 'This dispute is settled. Correct voters are eligible for rewards.'
              : 'Staked votes establish the initial consensus. A ZK-AI proof will trigger the final resolution.'
            }
          </p>
        </div>

        {/* Trinary Vote Choices */}
        {!isClosed && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="hud-label"><HelpCircle size={14} /> cast your verdict</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={() => setVoteChoice(1)}
                  className={`jury-vote-btn ${voteChoice === 1 ? 'selected-valid' : ''}`}
                >
                  <span className="text-xs font-bold">VALID (OFFSIDE)</span>
                  <span className="text-3xs font-mono opacity-80">Choice #1</span>
                </button>

                <button
                  type="button"
                  onClick={() => setVoteChoice(2)}
                  className={`jury-vote-btn ${voteChoice === 2 ? 'selected-invalid' : ''}`}
                >
                  <span className="text-xs font-bold">INVALID (ONSIDE)</span>
                  <span className="text-3xs font-mono opacity-80">Choice #2</span>
                </button>

                <button
                  type="button"
                  onClick={() => setVoteChoice(3)}
                  className={`jury-vote-btn ${voteChoice === 3 ? 'selected-inconclusive' : ''}`}
                >
                  <span className="text-xs font-bold">INCONCLUSIVE</span>
                  <span className="text-3xs font-mono opacity-80">Choice #3</span>
                </button>
              </div>
            </div>

            {/* Stake Input Slider */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="hud-label"><Sparkles size={14} /> Jury Weight Staked</label>
                <span className="text-xs font-mono text-[#A8FF35] font-bold">{stakeAmount} OKB</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="5.0"
                step="0.05"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="neon-range-slider"
              />
              <div className="flex justify-between text-3xs font-mono text-zinc-600">
                <span>0.05 OKB</span>
                <span>5.0 OKB</span>
              </div>

              {walletConnected && (
                <div className="flex justify-between text-3xs font-mono mt-1 text-zinc-500">
                  <span>WALLET BALANCE:</span>
                  <span className={isInsufficientBalance ? 'text-[#FF453A] font-bold' : 'text-[#A8FF35] font-bold'}>
                    {balance} OKB {isInsufficientBalance && '(INSUFFICIENT)'}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={handleCastVote}
              disabled={loading || isInsufficientBalance}
              className="neon-btn w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading 
                ? 'SUBMITTING VOTE...' 
                : !walletConnected
                  ? 'CONNECT METAMASK TO VOTE'
                  : isInsufficientBalance 
                    ? 'INSUFFICIENT OKB BALANCE' 
                    : 'CAST STAKED JURY VOTE'
              }
            </button>
          </div>
        )}

        {isClosed && (
          <div className="border border-zinc-800 rounded-lg p-5 bg-black/60 flex flex-col gap-4 font-mono text-xs">
            <div className="flex items-start gap-2.5 text-zinc-400 leading-normal">
              <Info size={16} className="text-[#A8FF35] shrink-0 mt-0.5" />
              <span>
                The AI Referee verified this decision on-chain. If your jury vote matched the verified verdict, click below to claim your proportional reward.
              </span>
            </div>

            <button
              onClick={() => claimJuryRewards(activePlayId)}
              disabled={loading}
              className="neon-btn w-full py-3 mt-1"
            >
              {loading ? 'CLAIMING...' : 'CLAIM JURY REWARDS'}
            </button>
          </div>
        )}
      </div>

      {/* Divider line */}
      <div className="hidden md:block w-px bg-zinc-800/80 my-2" />

      {/* 2. Right side: Prover trigger & jury distributions */}
      <div className="w-full md:w-72 flex flex-col justify-between gap-5 font-mono">
        <div className="border border-zinc-800 rounded-lg p-4 bg-black/50 flex flex-col gap-3.5">
          <h4 className="text-glow-cyan text-[#00F5FF] text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Shield size={14} /> Jury Pool Status
          </h4>
          
          <div className="flex flex-col gap-2.5 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">TOTAL JURY POOL:</span>
              <span className="text-white tabular-nums font-bold">{dispute.totalJuryStaked} OKB</span>
            </div>
            <div className="h-px bg-zinc-900" />
            <div className="flex justify-between items-center text-3xs text-zinc-500">
              <span>VALID (OFFSIDE):</span>
              <span className="text-white tabular-nums">{dispute.votesValid} OKB</span>
            </div>
            <div className="flex justify-between items-center text-3xs text-zinc-500">
              <span>INVALID (ONSIDE):</span>
              <span className="text-white tabular-nums">{dispute.votesInvalid} OKB</span>
            </div>
            <div className="flex justify-between items-center text-3xs text-zinc-500">
              <span>INCONCLUSIVE:</span>
              <span className="text-white tabular-nums">{dispute.votesInconclusive} OKB</span>
            </div>
          </div>
        </div>

        {/* Dynamic SP1 pipeline launcher */}
        {!isClosed ? (
          <div className="flex flex-col gap-2">
            <button
              onClick={handleTriggerZK}
              disabled={isZKProving || txLoading}
              className="w-full bg-transparent border border-[#A8FF35] hover:bg-[#A8FF35]/10 text-[#A8FF35] rounded-lg py-3 font-heading font-bold text-xs flex items-center justify-center gap-2 transition-all duration-200 uppercase"
              style={{ boxShadow: '0 0 15px rgba(168,255,53,0.1)' }}
            >
              <Sparkles size={14} className="animate-pulse" />
              Trigger ZK-AI Referee (SP1)
            </button>
            <span className="text-3xs text-zinc-600 text-center leading-normal">
              Compiles ZK-VM guest program, performs proof inference, and verifies on-chain.
            </span>
          </div>
        ) : (
          <div className="bg-[#121214]/60 border border-zinc-800 rounded-lg p-4 flex flex-col gap-2 text-3xs text-zinc-500">
            <span className="text-[#A8FF35] font-bold block mb-1">ZK VERDICT RESOLVED</span>
            <div className="flex justify-between">
              <span>AI DETERMINED:</span>
              <span className="text-[#A8FF35] font-bold uppercase">{dispute.zkVerdict === 1 ? 'OFFSIDE' : 'ONSIDE'}</span>
            </div>
            <div className="flex justify-between">
              <span>ON-CHAIN RESOLUTION:</span>
              <span className="text-[#00F5FF] font-bold">SP1-ZK VERIFIED</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
