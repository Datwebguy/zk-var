import { useEffect, useState } from 'react';
import { AnimatedBackground } from './components/AnimatedBackground';
import { VARPanel } from './components/VARPanel';
import { JuryVote } from './components/JuryVote';
import { PredictionBoard } from './components/PredictionBoard';
import { WalletConnect } from './components/WalletConnect';
import { ZKProver } from './components/ZKProver';
import { AdminPanel } from './components/AdminPanel';
import { TransactionHistory } from './components/TransactionHistory';
import { ClaimCenter } from './components/ClaimCenter';
import { usePrediction } from './hooks/usePrediction';
import {
  Activity,
  BookOpen,
  Cpu,
  Gift,
  History,
  Home,
  LineChart,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  Wrench
} from 'lucide-react';

import './styles/globals.css';
import './styles/animations.css';
import './styles/components.css';

function App() {
  const [activePlayId, setActivePlayId] = useState(101);
  const [activePage, setActivePage] = useState('home');
  const { fetchPredictionPools, fetchDisputes } = usePrediction();

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'markets', label: 'Markets', icon: LineChart },
    { id: 'tribunal', label: 'Tribunal', icon: ShieldCheck },
    { id: 'prover', label: 'ZK Prover', icon: Cpu },
    { id: 'history', label: 'History', icon: History },
    { id: 'admin', label: 'Admin', icon: Wrench }
  ];

  useEffect(() => {
    fetchPredictionPools();
    fetchDisputes();

    const interval = setInterval(() => {
      fetchPredictionPools();
      fetchDisputes();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchPredictionPools, fetchDisputes]);

  return (
    <div className="app-container">
      <AnimatedBackground />

      <header className="header-bar">
        <div className="header-left">
          <img
            src="/zk-var-logo.svg"
            alt="ZK-VAR Sovereign Referee Arena"
            className="header-brand-logo"
          />
        </div>

        <div className="header-center text-glow-cyan">
          X LAYER L2 | ORACLE DISPATCH: SECURE
        </div>

        <div className="header-right">
          <WalletConnect />
        </div>
      </header>

      <div className="live-status-ticker">
        <div className="live-status-ticker-left">
          <span className="flex items-center gap-1 text-[#00F5FF]">
            <Activity size={10} className="animate-pulse" /> LIVE ON-CHAIN ARENA
          </span>
          <span className="text-zinc-700">|</span>
          <span className="text-white flex items-center gap-1">
            <Trophy size={10} className="text-[#A8FF35]" /> CURRENT AND FUTURE SPORTS MARKETS
          </span>
        </div>
        <div className="live-status-ticker-right flex items-center gap-3">
          <span className="text-glow-green text-[#A8FF35]">X LAYER L2 // OKB SETTLEMENT</span>
          <span className="text-zinc-700">|</span>
          <span className="text-glow-cyan text-[#00F5FF]">SP1 VERIFIER CONTRACT ONLINE</span>
        </div>
      </div>

      <nav className="page-nav" aria-label="ZK-VAR sections">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActivePage(id)}
            className={`page-nav-btn ${activePage === id ? 'active' : ''}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>

      <main className={activePage === 'home' ? 'landing-page' : 'page-shell'}>
        {activePage === 'home' && (
          <>
            <section className="landing-hero">
              <div className="landing-copy">
                <span className="all-caps-label">Decentralized VAR Prediction Engine</span>
                <h1>ZK-powered sports markets for disputed referee decisions.</h1>
                <p>
                  ZK-VAR lets fans predict controversial match outcomes, stake OKB on active markets,
                  and resolve disputes through an on-chain referee pipeline designed for transparent settlement.
                </p>
                <div className="landing-actions">
                  <button type="button" className="neon-btn" onClick={() => setActivePage('markets')}>
                    Open Markets
                  </button>
                  <button type="button" className="outline-action-btn" onClick={() => setActivePage('tribunal')}>
                    View Tribunal
                  </button>
                </div>
              </div>

              <div className="landing-signal-panel">
                <img src="/zk-var-social-icon.svg" alt="ZK-VAR icon" className="landing-icon" />
                <div className="landing-stat-grid">
                  <span>Predict</span>
                  <strong>Stake on live calls</strong>
                  <span>Dispute</span>
                  <strong>Fan jury consensus</strong>
                  <span>Verify</span>
                  <strong>SP1 ZK proof flow</strong>
                  <span>Claim</span>
                  <strong>Wallet-scoped rewards</strong>
                </div>
              </div>
            </section>

            <section className="feature-grid">
              <article className="glass-panel feature-card">
                <LineChart className="text-[#A8FF35]" size={20} />
                <h3>Prediction Markets</h3>
                <p>Admins deploy real sports markets; users stake on YES or NO outcomes and winners share the losing-side pool.</p>
              </article>
              <article className="glass-panel feature-card">
                <ShieldCheck className="text-[#00F5FF]" size={20} />
                <h3>Dispute Tribunal</h3>
                <p>Fan jurors stake weighted votes on disputed calls before the final verified outcome is submitted on-chain.</p>
              </article>
              <article className="glass-panel feature-card">
                <Cpu className="text-[#A8FF35]" size={20} />
                <h3>ZK Referee Pipeline</h3>
                <p>The proof panel demonstrates how verifiable referee decisions can be coordinated with an SP1-style ZK workflow.</p>
              </article>
              <article className="glass-panel feature-card">
                <Gift className="text-[#00F5FF]" size={20} />
                <h3>Claim Center</h3>
                <p>Connected wallets see their own positions, claimable payouts, refunds, jury rewards, and direct explorer links.</p>
              </article>
            </section>

            <section className="glass-panel guide-panel">
              <h2 className="section-title"><BookOpen size={14} /> How users interact</h2>
              <div className="guide-steps">
                <span>1. Connect wallet on X Layer.</span>
                <span>2. Open Markets and stake on a prediction pool.</span>
                <span>3. Join Tribunal if a play needs dispute voting.</span>
                <span>4. Wait for market resolution.</span>
                <span>5. Claim payouts, refunds, or jury rewards from History.</span>
              </div>
            </section>
          </>
        )}

        {activePage === 'markets' && (
          <>
            <div className="page-heading">
              <h2 className="section-title"><LineChart size={16} /> Prediction Markets</h2>
              <p>Browse active and resolved pools, stake on outcomes, and select a play for tribunal review.</p>
            </div>
            <PredictionBoard
              onSelectPlay={(playId) => setActivePlayId(playId)}
              activePlayId={activePlayId}
            />
          </>
        )}

        {activePage === 'tribunal' && (
          <>
            <div className="glass-panel warning-banner">
              <ShieldAlert className="text-[#FFD60A] shrink-0" size={18} />
              <div className="warning-banner-text">
                <p>
                  <strong className="text-[#FFD60A]">VAR PROTOCOL ACTIVE:</strong> Play ID #{activePlayId} is selected for computational review. Jury consensus can form here.
                </p>
                <span className="text-glow-cyan text-[#00F5FF] shrink-0 font-bold ml-2">
                  SP1 VERIFIER CONTRACT ONLINE
                </span>
              </div>
            </div>

            <div className="split-page-grid">
              <section className="flex flex-col">
                <h2 className="section-title">
                  <Trophy size={14} className="text-[#A8FF35]" /> Spatial Camera Feed
                </h2>
                <VARPanel activePlayId={activePlayId} />
              </section>
              <section className="flex flex-col">
                <h2 className="section-title">
                  <ShieldCheck size={14} className="text-[#00F5FF]" /> Decentralized Tribunal
                </h2>
                <JuryVote activePlayId={activePlayId} />
              </section>
            </div>
          </>
        )}

        {activePage === 'prover' && (
          <section className="single-page-panel">
            <h2 className="section-title">
              <Cpu size={14} className="text-[#A8FF35]" /> ZK Prover Proof Pipeline
            </h2>
            <ZKProver />
          </section>
        )}

        {activePage === 'history' && (
          <>
            <div className="page-heading">
              <h2 className="section-title"><History size={16} /> Wallet Activity</h2>
              <p>Review your wallet positions, claim status, transaction history, and market feed with explorer links.</p>
            </div>
            <ClaimCenter />
            <TransactionHistory />
          </>
        )}

        {activePage === 'admin' && (
          <section className="single-page-panel">
            <AdminPanel />
          </section>
        )}
      </main>

      <footer className="w-full px-8 py-6 mt-16 border-t border-zinc-900 flex flex-col sm:flex-row justify-between items-center gap-4 text-3xs font-mono text-zinc-600 relative z-10">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#A8FF35]" />
          <span>ZK-VAR Platform // Built for X Layer Build X Hackathon 2026</span>
        </div>
        <div className="flex gap-4">
          <span>SP1 verifier: SECURE</span>
          <span>Settlement token: OKB</span>
          <span className="text-zinc-500">v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
