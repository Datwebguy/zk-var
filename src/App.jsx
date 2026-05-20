import React, { useEffect, useState } from 'react';
import { AnimatedBackground } from './components/AnimatedBackground';
import { VARPanel } from './components/VARPanel';
import { JuryVote } from './components/JuryVote';
import { PredictionBoard } from './components/PredictionBoard';
import { WalletConnect } from './components/WalletConnect';
import { ZKProver } from './components/ZKProver';
import { usePrediction } from './hooks/usePrediction';
import { ShieldAlert, Trophy, ShieldCheck, Activity, Cpu } from 'lucide-react';

// Import design system sheets
import './styles/globals.css';
import './styles/animations.css';
import './styles/components.css';

function App() {
  const [activePlayId, setActivePlayId] = useState(101); // Default to Messi offside play
  const { fetchPredictionPools, fetchDisputes } = usePrediction();

  // Load contract values on startup
  useEffect(() => {
    fetchPredictionPools();
    fetchDisputes();

    // Auto-refresh stats every 30 seconds for live feel
    const interval = setInterval(() => {
      fetchPredictionPools();
      fetchDisputes();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchPredictionPools, fetchDisputes]);

  return (
    <div className="app-container">
      {/* Immersive 60fps 3D Perspective Background */}
      <AnimatedBackground />

      {/* 8. Top Header Bar — Proper Full Width Structure */}
      <header className="header-bar">
        {/* Left: Brand logo & subtitle */}
        <div className="header-left">
          <h1 className="header-logo">
            ZK-VAR
          </h1>
          <span className="header-subtitle">
            Sovereign Referee Arena
          </span>
        </div>

        {/* Center: Live status ticker */}
        <div className="header-center text-glow-cyan">
          X LAYER L2 | ORACLE DISPATCH: SECURE
        </div>

        {/* Right: Wallet Connect */}
        <div className="header-right">
          <WalletConnect />
        </div>
      </header>

      {/* Sub-Header Live Match Ticker */}
      <div className="live-status-ticker">
        <div className="live-status-ticker-left">
          <span className="flex items-center gap-1 text-[#00F5FF]">
            <Activity size={10} className="animate-pulse" /> LIVE STREAM CALIBRATION
          </span>
          <span className="text-zinc-700">|</span>
          <span className="text-white flex items-center gap-1">
            <Trophy size={10} className="text-[#A8FF35]" /> WORLD CUP FINALS: ARGENTINA 2 - 2 FRANCE (82')
          </span>
        </div>
        <div className="live-status-ticker-right">
          <span className="text-glow-green text-[#A8FF35]">X LAYER L2 GAS: 0.1 Gwei</span>
          <span className="text-zinc-700">|</span>
          <span>ORACLE DISPATCH: SECURE</span>
        </div>
      </div>

      {/* 4. Restructured Main Grid Content */}
      <main className="main-grid">
        
        {/* LEFT COLUMN — 55% width */}
        <div className="left-column">
          
          {/* Top Warning Banner / Quick Status */}
          <div className="glass-panel warning-banner">
            <ShieldAlert className="text-[#FFD60A] shrink-0" size={18} />
            <div className="warning-banner-text">
              <p>
                <strong className="text-[#FFD60A]">VAR PROTOCOL ACTIVE:</strong> Play ID #{activePlayId} is currently paused for computational review. Jury consensus forming.
              </p>
              <span className="text-glow-cyan text-[#00F5FF] shrink-0 font-bold ml-2">
                SP1 VERIFIER CONTRACT ONLINE
              </span>
            </div>
          </div>

          {/* 5. VAR Panel - Hero Camera Feed & Telemetry HUD */}
          <section className="flex flex-col">
            <h2 className="section-title">
              <Trophy size={14} className="text-[#A8FF35]" /> SPATIAL CAMERA FEED
            </h2>
            <VARPanel activePlayId={activePlayId} />
          </section>

        </div>

        {/* RIGHT COLUMN — 45% width */}
        <div className="right-column">
          
          {/* ZKProver Embedded Card */}
          <section className="flex flex-col">
            <h2 className="section-title">
              <Cpu size={14} className="text-[#A8FF35]" /> ZK PROVER (PROOF PIPELINE)
            </h2>
            <ZKProver />
          </section>

          {/* Decentralized Tribunal / Jury Vote */}
          <section className="flex flex-col">
            <h2 className="section-title">
              <ShieldCheck size={14} className="text-[#00F5FF]" /> DECENTRALIZED TRIBUNAL
            </h2>
            <JuryVote activePlayId={activePlayId} />
          </section>

        </div>

        {/* FULL WIDTH BOTTOM */}
        <div className="full-width-bottom">
          <PredictionBoard 
            onSelectPlay={(playId) => setActivePlayId(playId)} 
            activePlayId={activePlayId} 
          />
        </div>

      </main>

      {/* Page Footer */}
      <footer className="w-full px-8 py-6 mt-16 border-t border-zinc-900 flex flex-col sm:flex-row justify-between items-center gap-4 text-3xs font-mono text-zinc-600 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#A8FF35]" />
          <span>ZK-VAR Platform // Built for X Layer Build X Hackathon 2026</span>
        </div>
        <div className="flex gap-4">
          <span>SP1 verifier: SECURE</span>
          <span>Gas token: OKB</span>
          <span className="text-zinc-500">v1.0.0 (Production)</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
