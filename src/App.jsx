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
import { DEFAULT_PROVEN_PLAY_ID } from './config/provenMarkets';
import { usePrediction } from './hooks/usePrediction';
import { useAppStore } from './store/useAppStore';
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
  const [activePlayId, setActivePlayId] = useState(DEFAULT_PROVEN_PLAY_ID);
  const [activePage, setActivePage] = useState('home');
  const { fetchPredictionPools, fetchDisputes } = usePrediction();
  const { userAddress, walletConnected, contractOwner } = useAppStore();
  const isContractOwner = Boolean(
    walletConnected &&
    userAddress &&
    contractOwner &&
    userAddress.toLowerCase() === contractOwner.toLowerCase()
  );

  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'markets', label: 'Markets', icon: LineChart },
    { id: 'tribunal', label: 'Tribunal', icon: ShieldCheck },
    { id: 'prover', label: 'ZK Prover', icon: Cpu },
    { id: 'history', label: 'History', icon: History },
    ...(isContractOwner ? [{ id: 'admin', label: 'Admin', icon: Wrench }] : [])
  ];

  const visiblePage = activePage === 'admin' && !isContractOwner ? 'home' : activePage;

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
          <button
            type="button"
            className="header-brand-link"
            onClick={() => setActivePage('home')}
            aria-label="Go to ZK-VAR homepage"
          >
            <img
              src="/zk-var-logo.svg"
              alt="ZK-VAR"
              className="header-brand-logo"
            />
          </button>
        </div>

        <div className="header-center text-glow-cyan">
          X CUP | WORLD CUP VAR MARKETS | X LAYER MAINNET
        </div>

        <div className="header-right">
          <WalletConnect />
        </div>
      </header>

      <div className="live-status-ticker">
        <div className="live-status-ticker-left">
          <span className="flex items-center gap-1 text-[#00F5FF]">
            <Activity size={10} className="animate-pulse" /> LIVE ON-CHAIN MARKETS
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
            className={`page-nav-btn ${visiblePage === id ? 'active' : ''}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </nav>

      <main className={visiblePage === 'home' ? 'landing-page' : 'page-shell'}>
        {visiblePage === 'home' && (
          <>
            <section className="landing-hero">
              <div className="landing-copy">
                <span className="all-caps-label">Built for X Cup on X Layer</span>
                <h1>ZK-powered World Cup markets for disputed referee decisions.</h1>
                <p>
                  ZK-VAR lets fans predict World Cup VAR moments, stake OKB on active markets,
                  join dispute voting, and claim rewards after on-chain resolution.
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
                  <strong>Staked jury consensus</strong>
                  <span>Verify</span>
                  <strong>Owner/oracle ZK flow</strong>
                  <span>Claim</span>
                  <strong>Wallet-scoped rewards</strong>
                </div>
              </div>
            </section>

            <section className="feature-grid">
              <article className="glass-panel feature-card">
                <LineChart className="text-[#A8FF35]" size={20} />
                <h3>Prediction Markets</h3>
                <p>Admins deploy World Cup-themed markets; users stake on YES or NO outcomes and winners share the losing-side pool.</p>
              </article>
              <article className="glass-panel feature-card">
                <ShieldCheck className="text-[#00F5FF]" size={20} />
                <h3>Dispute Tribunal</h3>
                <p>Fan jurors stake weighted votes on disputed World Cup calls before the final verified outcome is submitted on-chain.</p>
              </article>
              <article className="glass-panel feature-card">
                <Cpu className="text-[#A8FF35]" size={20} />
                <h3>ZK Referee Pipeline</h3>
                <p>The settlement flow requests an SP1 proof, commits the source-data hash, and verifies the proof on-chain.</p>
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

        {visiblePage === 'markets' && (
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

        {visiblePage === 'tribunal' && (
          <>
            <div className="glass-panel warning-banner">
              <ShieldAlert className="text-[#FFD60A] shrink-0" size={18} />
              <div className="warning-banner-text">
                <p>
                  <strong className="text-[#FFD60A]">VAR REVIEW ACTIVE:</strong> Play ID #{activePlayId} is selected for review. Tribunal voting is optional; market claims settle through the linked prediction pool.
                </p>
                <span className="text-glow-cyan text-[#00F5FF] shrink-0 font-bold ml-2">
                  SP1 VERIFIER CONTRACT ONLINE
                </span>
              </div>
            </div>

            <div className="split-page-grid">
              <section className="flex flex-col">
                <h2 className="section-title">
                  <Trophy size={14} className="text-[#A8FF35]" /> Review Feed
                </h2>
                <VARPanel activePlayId={activePlayId} />
              </section>
              <section className="flex flex-col">
                <h2 className="section-title">
                  <ShieldCheck size={14} className="text-[#00F5FF]" /> Dispute Tribunal
                </h2>
                <JuryVote activePlayId={activePlayId} />
              </section>
            </div>
          </>
        )}

        {visiblePage === 'prover' && (
          <section className="single-page-panel">
            <h2 className="section-title">
              <Cpu size={14} className="text-[#A8FF35]" /> ZK Prover Proof Pipeline
            </h2>
            <ZKProver />
          </section>
        )}

        {visiblePage === 'history' && (
          <>
            <div className="page-heading">
              <h2 className="section-title"><History size={16} /> Wallet Activity</h2>
              <p>Review your wallet positions, claim status, transaction history, and market feed with explorer links.</p>
            </div>
            <ClaimCenter />
            <TransactionHistory />
          </>
        )}

        {visiblePage === 'admin' && (
          <section className="single-page-panel">
            <AdminPanel />
          </section>
        )}
      </main>

      <footer className="app-footer">
        <div className="app-footer-brand">
          <div className="app-footer-dot" />
          <span>ZK-VAR Platform // Built on X Layer</span>
        </div>

        <div className="app-footer-links">
          <a href="https://github.com/Datwebguy/zk-var" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a href="https://x.com/TheZkVar" target="_blank" rel="noreferrer">
            Project X
          </a>
          <a href="https://x.com/Datweb3guy" target="_blank" rel="noreferrer">
            Developer X
          </a>
        </div>

        <div className="app-footer-status">
          <span>SP1 verifier: configured</span>
          <span>Settlement token: OKB</span>
          <span>v1.0.0</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
