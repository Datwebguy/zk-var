import { useState } from 'react';
import { usePrediction } from '../hooks/usePrediction';
import { useAppStore } from '../store/useAppStore';
import { PlusCircle, Wrench, Clock, HelpCircle, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';

export const AdminPanel = () => {
  const { createPoolAndDispute, loading, contractOwner } = usePrediction();
  const { userAddress, walletConnected, addNotification, predictionPools, disputes } = useAppStore();

  const [playId, setPlayId] = useState('103');
  const [poolId, setPoolId] = useState('3');
  const [question, setQuestion] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState('86400'); // Default 1 day

  // Check if current user is owner
  const ownerLoaded = Boolean(contractOwner);
  const isOwner = walletConnected && ownerLoaded && userAddress?.toLowerCase() === contractOwner?.toLowerCase();
  const canAccess = isOwner;
  const isCheckingOwner = walletConnected && !ownerLoaded;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!question.trim() || !description.trim()) {
      addNotification('error', 'Please fill in all text fields.');
      return;
    }

    const playNum = parseInt(playId);
    const poolNum = parseInt(poolId);
    const durationNum = parseInt(duration);

    if (isNaN(playNum) || playNum < 101) {
      addNotification('error', 'Play ID must be 101 or greater.');
      return;
    }

    if (isNaN(poolNum) || poolNum < 1) {
      addNotification('error', 'Pool ID must be 1 or greater.');
      return;
    }

    // Check for duplicates
    if (predictionPools.some(p => p.poolId === poolNum)) {
      addNotification('error', `Pool ID ${poolNum} already exists.`);
      return;
    }
    if (disputes.some(d => d.playId === playNum)) {
      addNotification('error', `Play ID ${playNum} already exists.`);
      return;
    }

    // Real on-chain creation
    const success = await createPoolAndDispute(playNum, poolNum, question.trim(), description.trim(), durationNum);
    if (success) {
      addNotification('success', `On-Chain Arena Pool & Dispute deployed!`);
      setPlayId((playNum + 1).toString());
      setPoolId((poolNum + 1).toString());
      setQuestion('');
      setDescription('');
    }
  };

  return (
    <div className="glass-panel p-6 flex flex-col gap-6" style={{ width: '100%' }}>
      <div className="flex justify-between items-center border-b border-zinc-800/80 pb-4">
        <h3 className="text-glow-green text-[#A8FF35] text-sm font-heading font-bold uppercase tracking-wider flex items-center gap-2">
          <Wrench size={16} /> Admin Console // Play deployment
        </h3>
      </div>

      {!canAccess ? (
        <div className="bg-[#1C120C] border border-[#FF9F0A]/20 p-4 rounded-lg flex items-start gap-3">
          <ShieldAlert className="text-[#FF9F0A] shrink-0" size={18} />
          <div className="font-mono text-xs flex flex-col gap-1.5">
            <span className="text-[#FF9F0A] font-bold">
              {isCheckingOwner ? 'CHECKING OWNER ACCESS...' : 'ACCESS RESTRICTED // OWNER ONLY'}
            </span>
            <p className="text-zinc-400">
              {!walletConnected
                ? 'Please connect your Web3 wallet. Only the contract owner address is permitted to deploy new prediction pools.'
                : isCheckingOwner
                  ? `Connected address: ${userAddress}. Reading the PredictionPool owner from X Layer...`
                  : `Only the contract owner address is permitted to deploy new prediction pools. Connected address: ${userAddress}. Contract owner: ${contractOwner || 'not loaded'}`}
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5 font-mono text-xs">
          
          {/* Status banner */}
          <div className="bg-[#0c1c13] border border-[#A8FF35]/10 p-3 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="text-[#A8FF35]" size={14} />
            <span className="text-zinc-400 text-3xs">
              LOGGED IN AS CONTRACT OWNER. Actions deploy to X Layer Testnet.
            </span>
          </div>

          {/* Primary configuration parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-500 flex items-center gap-1"><HelpCircle size={12} /> Play ID (Dispute):</label>
              <input
                type="number"
                value={playId}
                onChange={(e) => setPlayId(e.target.value)}
                className="bg-black/40 border border-zinc-800 rounded px-3 py-2 text-white focus:border-[#A8FF35] focus:outline-none tracking-wide"
                required
              />
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-500 flex items-center gap-1"><HelpCircle size={12} /> Pool ID (Prediction):</label>
              <input
                type="number"
                value={poolId}
                onChange={(e) => setPoolId(e.target.value)}
                className="bg-black/40 border border-zinc-800 rounded px-3 py-2 text-white focus:border-[#A8FF35] focus:outline-none tracking-wide"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-500 flex items-center gap-1"><Clock size={12} /> Pool Duration:</label>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="bg-black/40 border border-zinc-800 rounded px-3 py-2 text-white focus:border-[#A8FF35] focus:outline-none tracking-wide appearance-none"
              >
                <option value="600">10 Minutes (Test)</option>
                <option value="3600">1 Hour</option>
                <option value="86400">1 Day</option>
                <option value="604800">7 Days</option>
                <option value="2592000">30 Days</option>
              </select>
            </div>
          </div>

          {/* Question / Title input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-zinc-500 flex items-center gap-1"><HelpCircle size={12} /> Prediction Market Question:</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Will the VAR check rule Haaland's 72nd minute header OFFSIDE?"
              className="bg-black/40 border border-zinc-800 rounded px-3 py-2 text-white focus:border-[#A8FF35] focus:outline-none"
              required
            />
          </div>

          {/* Description input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-zinc-500 flex items-center gap-1"><FileText size={12} /> Referee Dispute Description (VAR Context):</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Haaland 72' - Possible offside on build-up cross. Direct check on attacker posture."
              rows={2}
              className="bg-black/40 border border-zinc-800 rounded px-3 py-2 text-white focus:border-[#A8FF35] focus:outline-none resize-none"
              required
            />
          </div>

          {/* Action button */}
          <button
            type="submit"
            disabled={loading}
            className="neon-btn w-full py-2.5 flex items-center justify-center gap-2"
          >
            <PlusCircle size={16} />
            {loading ? "DEPLOYING TO BLOCKCHAIN..." : "DEPLOY NEW ARENA PLAY (ON-CHAIN)"}
          </button>
        </form>
      )}
    </div>
  );
};
