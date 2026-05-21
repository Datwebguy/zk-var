import { useState } from 'react';
import { useWallet } from '../hooks/useWallet';
import { useAppStore } from '../store/useAppStore';
import { Wallet, LogOut, X, CheckCircle, HelpCircle, Activity } from 'lucide-react';
import { truncateAddress } from '../utils/contractHelpers';

export const WalletConnect = () => {
  const { walletConnected, userAddress, balance, chainId, connectWallet, disconnectWallet } = useWallet();
  const { notifications, removeNotification } = useAppStore();
  
  const [modalOpen, setModalOpen] = useState(false);

  const handleConnect = async (type) => {
    await connectWallet(type);
    setModalOpen(false);
  };

  return (
    <div className="relative">
      
      {/* 1. In-Nav Trigger Button */}
      {walletConnected ? (
        <button
          onClick={() => setModalOpen(true)}
          className="glass-panel px-4 py-2 flex items-center gap-2 hover:border-[#A8FF35] transition-all"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-[#A8FF35] animate-ping" />
          <span className="font-mono text-xs text-white tracking-wide">
            {truncateAddress(userAddress)}
          </span>
        </button>
      ) : (
        <button
          onClick={() => setModalOpen(true)}
          className="btn-connect text-xs"
        >
          <Wallet size={14} /> CONNECT WALLET
        </button>
      )}

      {/* 2. Glassmorphic Connection Overlay Modal */}
      {modalOpen && (
        <div className="wallet-hud-overlay" onClick={() => setModalOpen(false)}>
          <div className="wallet-hud-card anim-float" onClick={(e) => e.stopPropagation()}>
            
            {/* Modal Header */}
            <div className="wallet-hud-header">
              <span className="wallet-hud-title">
                <Wallet size={16} className="text-[#A8FF35]" /> Web3 Wallet HUD
              </span>
              <button 
                onClick={() => setModalOpen(false)}
                className="wallet-hud-close"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="wallet-hud-body">
              
              {!walletConnected ? (
                <>
                  <p className="wallet-hud-text">
                    Connect your wallet to lock stakes, predict World Cup outcomes, and collect yield rewards on X Layer L2.
                  </p>

                  {/* Primary wallet connector */}
                  <button
                    onClick={() => handleConnect('metamask')}
                    className="wallet-hud-connector-btn primary-btn"
                  >
                    <div className="flex flex-col items-start">
                      <span className="wallet-hud-connector-label">
                        CONNECT WALLET
                      </span>
                      <span className="wallet-hud-connector-sub">
                        Reown AppKit: MetaMask, WalletConnect, Coinbase, Rabby
                      </span>
                    </div>
                    <CheckCircle size={18} className="text-[#A8FF35] opacity-80" />
                  </button>

                  {/* Secondary OKX direct option */}
                  <button
                    onClick={() => handleConnect('okx')}
                    className="wallet-hud-connector-btn secondary-btn"
                  >
                    <div className="flex flex-col items-start">
                      <span className="wallet-hud-connector-label" style={{ color: '#00F5FF' }}>
                        OKX DIRECT
                      </span>
                      <span className="wallet-hud-connector-sub">
                        Optional injected wallet fallback
                      </span>
                    </div>
                    <HelpCircle size={18} className="text-[#00F5FF]" />
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-4">
                  {/* Connected Statistics panel */}
                  <div className="wallet-hud-stats">
                    <div className="wallet-hud-stat-item">
                      <span className="wallet-hud-stat-label">ACCOUNT:</span>
                      <span className="wallet-hud-stat-val">{truncateAddress(userAddress)}</span>
                    </div>
                    <div className="wallet-hud-stat-item">
                      <span className="wallet-hud-stat-label">OKB BALANCE:</span>
                      <span className="wallet-hud-stat-val green">{balance} OKB</span>
                    </div>
                    <div className="wallet-hud-stat-item">
                      <span className="wallet-hud-stat-label">NETWORK:</span>
                      <span className="wallet-hud-stat-val cyan">
                        <Activity size={10} className="animate-pulse" />
                        {chainId === 1952 ? 'X Layer Test' : 'Unknown Chain'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      disconnectWallet();
                      setModalOpen(false);
                    }}
                    className="wallet-hud-disconnect-btn"
                  >
                    <LogOut size={14} /> DISCONNECT WALLET
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}


      {/* 3. Floating Neon Toast Notification Queue Overlay */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 w-80 max-w-full">
        {notifications.map((n) => {
          let styleClass = 'border-zinc-800';
          let borderGlow = 'rgba(255,255,255,0.05)';
          
          if (n.type === 'success') {
            styleClass = 'border-[#30D158]/40 bg-[#0A0A0B]/90';
            borderGlow = '0 0 15px rgba(48,209,88,0.15)';
          } else if (n.type === 'error') {
            styleClass = 'border-[#FF453A]/40 bg-[#0A0A0B]/90';
            borderGlow = '0 0 15px rgba(255,69,58,0.15)';
          } else if (n.type === 'pending') {
            styleClass = 'border-[#FFD60A]/40 bg-[#0A0A0B]/90';
            borderGlow = '0 0 15px rgba(255,214,10,0.15)';
          }

          return (
            <div
              key={n.id}
              onClick={() => removeNotification(n.id)}
              className={`glass-panel p-4 rounded-lg border flex flex-col gap-1.5 cursor-pointer relative shadow-lg toast-slide-in ${styleClass}`}
              style={{ boxShadow: borderGlow }}
            >
              <div className="flex justify-between items-start gap-3">
                <span className={`text-2xs font-mono font-bold tracking-wider uppercase ${
                  n.type === 'success' ? 'text-[#30D158]' : n.type === 'error' ? 'text-[#FF453A]' : 'text-[#FFD60A]'
                }`}>
                  {n.type}
                </span>
                <button className="text-zinc-600 hover:text-zinc-400 text-3xs">✕</button>
              </div>
              <p className="text-xs text-white font-medium pr-2 leading-relaxed">
                {n.message}
              </p>
              {n.txHash && (
                <a
                  href={`https://www.okx.com/web3/explorer/xlayer-test/tx/${n.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-3xs font-mono text-[#00F5FF] hover:underline pt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  TX Hash: {truncateAddress(n.txHash)} ↗
                </a>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
};
