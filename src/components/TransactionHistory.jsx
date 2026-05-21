import { useState } from 'react';
import { ExternalLink, History, RefreshCw, UserRound, Globe2 } from 'lucide-react';
import { useTransactionHistory } from '../hooks/useTransactionHistory';
import { useWallet } from '../hooks/useWallet';

const formatDate = (timestamp) => {
  if (!timestamp) return 'Pending';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp));
};

const HistoryList = ({ items, emptyText }) => {
  if (items.length === 0) {
    return (
      <div className="border border-zinc-800 rounded-lg bg-black/50 px-4 py-6 text-center text-3xs font-mono text-zinc-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id || item.hash}
          className="border border-zinc-800 rounded-lg bg-black/50 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-3xs font-mono text-[#00F5FF] uppercase tracking-wider">{item.type}</span>
              <span className="text-3xs font-mono text-zinc-600">{formatDate(item.timestamp)}</span>
            </div>
            <span className="text-xs text-white font-bold truncate">{item.label}</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-3xs font-mono text-zinc-500">
              {item.target && <span>{item.target}</span>}
              {item.amount && <span className="text-[#A8FF35]">{item.amount}</span>}
              <span>{item.status || 'confirmed'}</span>
            </div>
          </div>

          <a
            href={item.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border border-[#00F5FF]/40 text-[#00F5FF] hover:bg-[#00F5FF]/10 text-3xs font-mono uppercase tracking-wider"
          >
            Explorer <ExternalLink size={12} />
          </a>
        </div>
      ))}
    </div>
  );
};

export const TransactionHistory = () => {
  const { walletConnected, userAddress } = useWallet();
  const [activeTab, setActiveTab] = useState('personal');
  const {
    personalHistory,
    publicHistory,
    loading,
    error,
    scannedRange,
    refreshHistory
  } = useTransactionHistory(userAddress);

  const showingPersonal = activeTab === 'personal';

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="section-title">
          <History size={14} className="text-[#A8FF35]" /> TRANSACTION HISTORY
        </h2>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('personal')}
            className={`px-3 py-1.5 rounded-md border text-3xs font-mono uppercase tracking-wider flex items-center gap-1.5 ${
              showingPersonal
                ? 'border-[#A8FF35] text-[#A8FF35] bg-[#A8FF35]/10'
                : 'border-zinc-800 text-zinc-500 hover:text-white'
            }`}
          >
            <UserRound size={12} /> My Wallet
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('public')}
            className={`px-3 py-1.5 rounded-md border text-3xs font-mono uppercase tracking-wider flex items-center gap-1.5 ${
              !showingPersonal
                ? 'border-[#00F5FF] text-[#00F5FF] bg-[#00F5FF]/10'
                : 'border-zinc-800 text-zinc-500 hover:text-white'
            }`}
          >
            <Globe2 size={12} /> Market Feed
          </button>

          <button
            type="button"
            onClick={refreshHistory}
            disabled={loading}
            className="px-3 py-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 text-3xs font-mono uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <div className="glass-panel p-4 bg-[#121214]/40 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-3xs font-mono text-zinc-500">
          <span>
            {showingPersonal
              ? walletConnected
                ? 'Wallet-scoped activity, with direct explorer links.'
                : 'Connect a wallet to view your personal activity.'
              : 'Public on-chain prediction and jury stake feed.'}
          </span>
          {scannedRange && (
            <span>
              Blocks {scannedRange.fromBlock} - {scannedRange.toBlock}
            </span>
          )}
        </div>

        {error && (
          <div className="border border-[#FF453A]/40 bg-[#FF453A]/10 rounded-lg px-3 py-2 text-3xs font-mono text-[#FF453A]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="border border-zinc-800 rounded-lg bg-black/50 px-4 py-6 text-center text-3xs font-mono text-zinc-500">
            Loading X Layer history...
          </div>
        ) : showingPersonal ? (
          <HistoryList
            items={personalHistory}
            emptyText={walletConnected ? 'No transactions found for this wallet yet.' : 'Connect a wallet to see your personal history.'}
          />
        ) : (
          <HistoryList
            items={publicHistory}
            emptyText="No recent public prediction or jury stake events found in the scanned range."
          />
        )}
      </div>
    </section>
  );
};
