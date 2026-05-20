import React, { useState } from 'react';
import { usePrediction } from '../hooks/usePrediction';
import { useWallet } from '../hooks/useWallet';
import { TrendingUp, HelpCircle, AlertCircle, Coins } from 'lucide-react';

export const PredictionBoard = ({ onSelectPlay, activePlayId }) => {
  const { predictionPools, placePrediction, loading } = usePrediction();
  const { walletConnected, balance, connectWallet } = useWallet();

  const [selectedPoolId, setSelectedPoolId] = useState(1);
  const [selectedOutcome, setSelectedOutcome] = useState(1); // 1 = Yes (Valid), 2 = No (Invalid)
  const [stakeAmount, setStakeAmount] = useState('0.1');

  // Static pre-transaction calculations
  const selectedPool = predictionPools.find(p => p.poolId === selectedPoolId) || predictionPools[0];
  const poolStakedOutcome1 = selectedPool ? parseFloat(selectedPool.stakedOutcome1) || 0 : 0;
  const poolStakedOutcome2 = selectedPool ? parseFloat(selectedPool.stakedOutcome2) || 0 : 0;
  const poolTotal = selectedPool ? parseFloat(selectedPool.totalStaked) || 0 : 0;
  
  const userStake = parseFloat(stakeAmount) || 0.0;
  const newTotal = poolTotal + userStake;
  
  const userBalance = walletConnected ? parseFloat(balance) || 0 : 0.0;
  const isInsufficientBalance = walletConnected && (userStake > userBalance);

  // Dynamic payout calculations
  let calculatedPayout = '0.00';
  if (selectedPool && userStake > 0) {
    if (selectedOutcome === 1) {
      const winningPool = poolStakedOutcome1 + userStake;
      calculatedPayout = ((userStake / winningPool) * newTotal).toFixed(2);
    } else {
      const winningPool = poolStakedOutcome2 + userStake;
      calculatedPayout = ((userStake / winningPool) * newTotal).toFixed(2);
    }
  }

  // Handle betting prediction submission
  const handleSubmitPrediction = async () => {
    if (!walletConnected) {
      await connectWallet('okx');
      return;
    }
    if (!selectedPool || userStake <= 0 || isInsufficientBalance) return;
    await placePrediction(selectedPoolId, selectedOutcome, userStake);
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
                    <span className={`status-badge ${pool.status === 0 ? 'active' : 'resolved'}`}>
                      {pool.status === 0 ? 'OPEN' : 'RESOLVED'}
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
                    </div>
                    
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
                  <span className="text-3xs font-mono opacity-80 mt-0.5">Pay: 1 : 1.45</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOutcome(2)}
                  className={`jury-vote-btn ${selectedOutcome === 2 ? 'active' : ''}`}
                  style={{ padding: '10px 12px' }}
                >
                  <span className="text-xs font-bold">NO / ONSIDE</span>
                  <span className="text-3xs font-mono opacity-80 mt-0.5">Pay: 1 : 2.80</span>
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
                    {balance} OKB {isInsufficientBalance && '(INSUFFICIENT)'}
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
              disabled={loading || (walletConnected && isInsufficientBalance)}
              className="neon-btn w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading 
                ? 'BROADCASTING...' 
                : !walletConnected 
                  ? 'CONNECT TO PLACE' 
                  : isInsufficientBalance 
                    ? 'INSUFFICIENT OKB BALANCE' 
                    : 'SUBMIT PREDICTION'
              }
            </button>
          </div>
        )}
      </div>
      
    </div>
  );
};
