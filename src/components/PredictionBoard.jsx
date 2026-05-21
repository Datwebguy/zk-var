import { useState } from 'react';
import { usePrediction } from '../hooks/usePrediction';
import { useWallet } from '../hooks/useWallet';
import { TrendingUp, HelpCircle, AlertCircle, Coins } from 'lucide-react';

export const PredictionBoard = ({ onSelectPlay, activePlayId }) => {
  const { predictionPools, userPoolBets, placePrediction, claimPayout, claimRefund, loading } = usePrediction();
  const { walletConnected, balance, balanceReady, balanceLoading, connectWallet } = useWallet();

  const [selectedPoolId, setSelectedPoolId] = useState(1);
  const [selectedOutcome, setSelectedOutcome] = useState(1); // 1 = Yes (Valid), 2 = No (Invalid)
  const [stakeAmount, setStakeAmount] = useState('0.1');

  // Static pre-transaction calculations
  const selectedPool = predictionPools.find(p => p.poolId === selectedPoolId) || predictionPools[0];
  const poolStakedOutcome1 = selectedPool ? parseFloat(selectedPool.stakedOutcome1) || 0 : 0;
  const poolStakedOutcome2 = selectedPool ? parseFloat(selectedPool.stakedOutcome2) || 0 : 0;
  const poolTotal = selectedPool ? parseFloat(selectedPool.totalStaked) || 0 : 0;
  const selectedPoolIsOpen = selectedPool?.status === 0;
  const selectedPoolIsResolved = selectedPool?.status === 2;
  const selectedPoolIsCancelled = selectedPool?.status === 3;
  const selectedPoolCanRefund = selectedPoolIsCancelled || (selectedPoolIsResolved && (poolStakedOutcome1 === 0 || poolStakedOutcome2 === 0));
  const selectedUserBet = selectedPool ? userPoolBets[selectedPool.poolId] : null;
  const selectedUserStake = parseFloat(selectedUserBet?.amount || '0') || 0;
  const selectedUserHasStake = selectedUserStake > 0;
  const selectedUserClaimed = Boolean(selectedUserBet?.claimed);
  
  const userStake = parseFloat(stakeAmount) || 0.0;
  const newTotal = poolTotal + userStake;
  
  const userBalance = walletConnected ? parseFloat(balance) || 0 : 0.0;
  const isInsufficientBalance = walletConnected && balanceReady && (userStake > userBalance);

  const estimateReturn = (outcome) => {
    if (!selectedPool || userStake <= 0) return '0.00';
    const winningPool = outcome === 1 ? poolStakedOutcome1 + userStake : poolStakedOutcome2 + userStake;
    if (winningPool <= 0) return '0.00';
    return ((userStake / winningPool) * newTotal).toFixed(2);
  };

  const calculatedPayout = estimateReturn(selectedOutcome);

  // Handle betting prediction submission
  const handleSubmitPrediction = async () => {
    if (!walletConnected) {
      await connectWallet('metamask');
      return;
    }
    if (!selectedPool || userStake <= 0 || isInsufficientBalance) return;
    await placePrediction(selectedPoolId, selectedOutcome, userStake);
  };

  const handleClaimPayout = async (poolId = selectedPoolId) => {
    if (!walletConnected) {
      await connectWallet('metamask');
      return;
    }
    await claimPayout(poolId);
  };

  const handleClaimRefund = async (poolId = selectedPoolId) => {
    if (!walletConnected) {
      await connectWallet('metamask');
      return;
    }
    await claimRefund(poolId);
  };

  return (
    <div className="prediction-board-layout">
      
      {/* 1. Prediction Pools Market Lists (Rendered as Card Grid) */}
      <div className="prediction-pools-section">
        <h3 className="section-title">
          <TrendingUp size={16} /> Active Prediction Pools (OKB)
        </h3>
        
        <div className="prediction-pools-grid">
          {predictionPools.length === 0 ? (
            <div className="glass-panel p-6 bg-[#121214]/40 flex flex-col items-center justify-center text-center min-h-[220px] relative overflow-hidden" style={{ gridColumn: '1 / -1' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-[#A8FF35]/5 to-transparent pointer-events-none" />
              <TrendingUp size={36} className="text-zinc-600 mb-3 animate-pulse" />
              <h4 className="font-heading font-bold text-sm text-white mb-1">Connecting to Arena Markets</h4>
              <p className="text-3xs text-zinc-500 font-mono max-w-xs leading-normal">
                Retrieving active prediction pools directly from X Layer smart contracts. Please ensure your network is reachable.
              </p>
            </div>
          ) : (
            predictionPools.map((pool) => {
              const isActive = pool.disputeId === activePlayId;
              const totalStakedVal = parseFloat(pool.totalStaked) || 0;
              const staked1Val = parseFloat(pool.stakedOutcome1) || 0;
              const staked2Val = parseFloat(pool.stakedOutcome2) || 0;
              const isPoolOpen = pool.status === 0;
              const isPoolResolved = pool.status === 2;
              const isPoolCancelled = pool.status === 3;
              const canRefundPool = isPoolCancelled || (isPoolResolved && (staked1Val === 0 || staked2Val === 0));
              const statusLabel = isPoolOpen ? 'OPEN' : isPoolCancelled ? 'CANCELLED' : isPoolResolved ? 'RESOLVED' : 'CLOSED';
              const poolUserBet = userPoolBets[pool.poolId];
              const poolUserStake = parseFloat(poolUserBet?.amount || '0') || 0;
              const poolUserHasStake = poolUserStake > 0;
              const poolUserClaimed = Boolean(poolUserBet?.claimed);

              const pctOutcome1 = totalStakedVal > 0 
                ? ((staked1Val / totalStakedVal) * 100).toFixed(0) 
                : '50';
              const pctOutcome2 = totalStakedVal > 0 
                ? ((staked2Val / totalStakedVal) * 100).toFixed(0) 
                : '50';

              return (
                <div
                  key={pool.poolId}
                  onClick={() => {
                    onSelectPlay(pool.disputeId);
                    setSelectedPoolId(pool.poolId);
                  }}
                  className={`glass-panel cursor-pointer flex flex-col gap-4 relative transition-all duration-300 ${
                    isActive ? 'active-card shadow-[0_0_24px_rgba(168,255,53,0.15)]' : ''
                  }`}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    minHeight: '220px'
                  }}
                >
                  {/* Header info */}
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex flex-col">
                      <span className="all-caps-label mb-1">
                        {pool.match}
                      </span>
                      <h4 className="text-sm font-heading font-bold text-white pr-2 leading-snug">
                        {pool.question}
                      </h4>
                    </div>
                    <span className={`status-badge ${isPoolOpen ? 'active' : 'resolved'}`}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* YES/NO percentage bar (neon-green fill) */}
                  <div className="flex flex-col gap-2 text-3xs font-mono text-zinc-400">
                    <div className="flex justify-between font-bold">
                      <span>YES (OFFSIDE): {pctOutcome1}% ({pool.stakedOutcome1} OKB)</span>
                      <span>NO (ONSIDE): {pctOutcome2}% ({pool.stakedOutcome2} OKB)</span>
                    </div>
                    
                    {/* Visual Ratio split bar with neon-green fill */}
                    <div style={{
                      height: '8px',
                      backgroundColor: '#121214',
                      borderRadius: '9999px',
                      overflow: 'hidden',
                      display: 'flex',
                      width: '100%',
                      border: '1px solid #27272a'
                    }}>
                      <div 
                        className="h-full transition-all duration-500" 
                        style={{ 
                          width: `${pctOutcome1}%`, 
                          backgroundColor: '#A8FF35', 
                          boxShadow: '0 0 10px rgba(168, 255, 53, 0.5)' 
                        }} 
                      />
                      <div 
                        className="h-full transition-all duration-500" 
                        style={{ 
                          width: `${pctOutcome2}%`, 
                          backgroundColor: '#48484A' 
                        }} 
                      />
                    </div>
                  </div>

                  {/* Footer details + Selection Open Button */}
                  <div className="flex justify-between items-center text-3xs font-mono pt-3 border-t border-zinc-800/80 mt-auto">
                    <div className="flex flex-col gap-0.5">
                      <span>POOL ID: #{pool.poolId}</span>
                      <span className="text-white font-bold tabular-nums">TOTAL POOL: {pool.totalStaked} OKB</span>
                      {isPoolResolved && (
                        <span className="text-[#A8FF35] font-bold">WINNER: OUTCOME #{pool.winningOutcome}</span>
                      )}
                      {poolUserHasStake && (
                        <span className={poolUserClaimed ? 'text-zinc-500 font-bold' : 'text-[#00F5FF] font-bold'}>
                          YOUR STAKE: {poolUserStake.toFixed(2)} OKB {poolUserClaimed && '(CLAIMED)'}
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {!isPoolOpen && (
                        <button
                          className="btn-inactive-state"
                          disabled={poolUserClaimed || !poolUserHasStake}
                          style={{
                            fontSize: '10px',
                            fontWeight: '700',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            cursor: poolUserClaimed || !poolUserHasStake ? 'not-allowed' : 'pointer',
                            opacity: poolUserClaimed || !poolUserHasStake ? 0.5 : 1,
                            borderWidth: '1px'
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (poolUserClaimed || !poolUserHasStake) return;
                            canRefundPool ? handleClaimRefund(pool.poolId) : handleClaimPayout(pool.poolId);
                          }}
                        >
                          {poolUserClaimed ? 'CLAIMED' : !poolUserHasStake ? 'NO STAKE' : canRefundPool ? 'REFUND' : 'CLAIM'}
                        </button>
                      )}

                      <button
                        className={isActive ? 'btn-active-state' : 'btn-inactive-state'}
                        style={{
                          fontSize: '10px',
                          fontWeight: '700',
                          borderRadius: '6px',
                          padding: '6px 14px',
                          cursor: 'pointer',
                          borderWidth: '1px'
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectPlay(pool.disputeId);
                          setSelectedPoolId(pool.poolId);
                        }}
                      >
                        OPEN
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Fast Trade Panel (HUD) */}
      <div className="fast-trade-section">
        <h3 className="section-title text-[#00F5FF]">
          <Coins size={16} /> Fast Trade Panel
        </h3>

        {!selectedPool ? (
          <div className="fast-trade-card flex flex-col items-center justify-center text-center p-6 min-h-[300px] bg-[#121214]/40 border border-zinc-800 rounded-lg relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-[#00F5FF]/5 to-transparent pointer-events-none" />
            <Coins size={36} className="text-zinc-600 mb-3 animate-pulse" />
            <h4 className="font-heading font-bold text-sm text-white mb-1">No Active Pool Selected</h4>
            <p className="text-3xs text-zinc-500 font-mono leading-normal max-w-[180px] mb-6">
              Select a live arena pool from the left grid to open fast trade options.
            </p>
            <button disabled className="neon-btn w-full py-3 opacity-40 cursor-not-allowed uppercase font-bold text-xs tracking-wider">
              NO POOL SELECTED
            </button>
          </div>
        ) : (
          <div className="fast-trade-card">
            {/* Market selector visual */}
            <div className="font-mono text-3xs border-b border-zinc-800 pb-3">
              <span className="text-zinc-500 block mb-0.5">SELECTED POOL:</span>
              <span className="text-white font-bold line-clamp-1">{selectedPool.question}</span>
            </div>

            {!selectedPoolIsOpen ? (
              <div className="flex flex-col gap-4">
                <div className="border border-zinc-800 rounded-lg p-4 bg-black/60 font-mono text-3xs flex flex-col gap-2">
                  <div className="flex justify-between text-zinc-500">
                    <span>MARKET STATUS:</span>
                    <span className="text-[#A8FF35] font-bold">
                      {selectedPoolIsCancelled ? 'CANCELLED' : selectedPoolIsResolved ? 'RESOLVED' : 'CLOSED'}
                    </span>
                  </div>
                  {selectedPoolIsResolved && (
                    <div className="flex justify-between text-zinc-500">
                      <span>WINNING OUTCOME:</span>
                      <span className="text-white font-bold">#{selectedPool.winningOutcome}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-zinc-500">
                    <span>TOTAL POOL:</span>
                    <span className="text-white font-bold">{selectedPool.totalStaked} OKB</span>
                  </div>
                  {walletConnected && (
                    <>
                      <div className="flex justify-between text-zinc-500">
                        <span>YOUR STAKE:</span>
                        <span className="text-white font-bold">
                          {selectedUserHasStake ? `${selectedUserStake.toFixed(2)} OKB` : '0.00 OKB'}
                        </span>
                      </div>
                      {selectedUserHasStake && (
                        <div className="flex justify-between text-zinc-500">
                          <span>YOUR STATUS:</span>
                          <span className={selectedUserClaimed ? 'text-zinc-400 font-bold' : 'text-[#00F5FF] font-bold'}>
                            {selectedUserClaimed ? 'CLAIMED' : 'READY'}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="h-px bg-zinc-800 my-1" />
                  <div className="flex items-start gap-1 text-zinc-500 leading-normal">
                    <AlertCircle size={10} className="text-[#00F5FF] shrink-0 mt-0.5" />
                    <span>
                      {selectedUserClaimed
                        ? 'Your stake for this pool has already been claimed or refunded on-chain.'
                        : selectedPoolCanRefund
                        ? 'This market is refundable. Users with a stake in this pool can claim their original stake back.'
                        : 'If your prediction matched the winning outcome, claim your proportional payout from this market.'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => selectedPoolCanRefund ? handleClaimRefund() : handleClaimPayout()}
                  disabled={loading || (walletConnected && (!selectedUserHasStake || selectedUserClaimed))}
                  className="neon-btn w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? 'CLAIMING...'
                    : !walletConnected
                      ? 'CONNECT WALLET TO CLAIM'
                      : selectedUserClaimed
                        ? 'ALREADY CLAIMED'
                      : !selectedUserHasStake
                        ? 'NO STAKE IN THIS POOL'
                      : selectedPoolCanRefund
                        ? 'CLAIM REFUND'
                        : 'CLAIM PAYOUT'
                  }
                </button>
              </div>
            ) : (
              <>
                {/* Outcome Choice togglers */}
                <div className="flex flex-col gap-2">
                  <label className="hud-label"><HelpCircle size={14} /> Predict Outcome</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedOutcome(1)}
                      className={`jury-vote-btn ${selectedOutcome === 1 ? 'active' : ''}`}
                      style={{ padding: '10px 12px' }}
                    >
                      <span className="text-xs font-bold">YES / OFFSIDE</span>
                      <span className="text-3xs font-mono opacity-80 mt-0.5">Est return: {estimateReturn(1)} OKB</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedOutcome(2)}
                      className={`jury-vote-btn ${selectedOutcome === 2 ? 'active' : ''}`}
                      style={{ padding: '10px 12px' }}
                    >
                      <span className="text-xs font-bold">NO / ONSIDE</span>
                      <span className="text-3xs font-mono opacity-80 mt-0.5">Est return: {estimateReturn(2)} OKB</span>
                    </button>
                  </div>
                </div>

                {/* Preset Stake slider */}
                <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="hud-label"><Coins size={14} /> Stake Amount</label>
                <span className="text-xs font-mono text-[#A8FF35] tabular-nums font-bold">{stakeAmount} OKB</span>
              </div>
              <input
                type="range"
                min="0.05"
                max="2.5"
                step="0.05"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="neon-range-slider"
              />
              <div className="flex justify-between text-3xs font-mono text-zinc-600">
                <span>0.05 OKB</span>
                <span>2.5 OKB</span>
              </div>

              {walletConnected && (
                <div className="flex justify-between text-3xs font-mono mt-1 text-zinc-500">
                  <span>WALLET BALANCE:</span>
                  <span className={isInsufficientBalance ? 'text-[#FF453A] font-bold' : 'text-[#A8FF35] font-bold'}>
                    {balanceLoading ? 'CHECKING...' : `${balance} OKB`} {isInsufficientBalance && '(INSUFFICIENT)'}
                  </span>
                </div>
              )}
                </div>

                {/* Real-time Pre-Transaction Telemetry HUD */}
                <div className="border border-zinc-800 rounded-lg p-3 bg-black/60 font-mono text-3xs flex flex-col gap-2">
              <div className="flex justify-between text-zinc-500">
                <span>ESTIMATED GAS:</span>
                <span className="text-white tabular-nums">0.00014 OKB</span>
              </div>
              <div className="flex justify-between text-zinc-500">
                <span>ESTIMATED YIELD:</span>
                <span className="text-glow-green text-[#A8FF35] tabular-nums font-bold">~ {calculatedPayout} OKB</span>
              </div>
              <div className="h-px bg-zinc-800 my-1" />
              <div className="flex items-start gap-1 text-zinc-500 leading-normal">
                <AlertCircle size={10} className="text-[#00F5FF] shrink-0 mt-0.5" />
                <span>Yield shifts dynamically based on overall pool weights at resolution time.</span>
              </div>
                </div>

                {/* Place transaction button */}
                <button
                  onClick={handleSubmitPrediction}
                  disabled={loading || balanceLoading || isInsufficientBalance}
                  className="neon-btn w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading 
                    ? 'BROADCASTING...' 
                    : !walletConnected
                      ? 'CONNECT WALLET TO PLACE'
                      : balanceLoading
                        ? 'CHECKING OKB BALANCE...'
                      : isInsufficientBalance 
                        ? 'INSUFFICIENT OKB BALANCE' 
                        : 'SUBMIT PREDICTION'
                  }
                </button>
              </>
            )}
          </div>
        )}
      </div>
      
    </div>
  );
};
