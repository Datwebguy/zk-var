import { Gift, RefreshCw, ShieldCheck, Trophy } from 'lucide-react';
import { usePrediction } from '../hooks/usePrediction';
import { useWallet } from '../hooks/useWallet';

const toNumber = (value) => parseFloat(value || '0') || 0;

const getWinningStake = (pool) => (
  pool.winningOutcome === 1 ? toNumber(pool.stakedOutcome1) : toNumber(pool.stakedOutcome2)
);

const getPredictionClaim = (pool, bet) => {
  const stake = toNumber(bet?.amount);
  if (!bet || stake <= 0) return null;

  const isResolved = pool.status === 2;
  const isCancelled = pool.status === 3;
  const isRefundable = isCancelled || (isResolved && (toNumber(pool.stakedOutcome1) === 0 || toNumber(pool.stakedOutcome2) === 0));
  const winningStake = getWinningStake(pool);
  const isWinner = isResolved && Number(bet.outcome) === Number(pool.winningOutcome);

  if (bet.claimed) {
    return {
      action: 'claimed',
      label: `Pool #${pool.poolId}`,
      detail: `Your ${stake.toFixed(2)} OKB stake has already been claimed or refunded.`,
      amount: `${stake.toFixed(2)} OKB`
    };
  }

  if (isRefundable) {
    return {
      action: 'refund',
      label: `Pool #${pool.poolId}`,
      detail: 'Refundable market. No opposing side/liquidity was available for profit settlement.',
      amount: `${stake.toFixed(2)} OKB`
    };
  }

  if (isWinner && winningStake > 0) {
    const estimatedPayout = (stake * toNumber(pool.totalStaked)) / winningStake;
    return {
      action: 'payout',
      label: `Pool #${pool.poolId}`,
      detail: `Winning outcome #${pool.winningOutcome}. Payout follows pool-share math.`,
      amount: `${estimatedPayout.toFixed(4)} OKB`
    };
  }

  if (isResolved) {
    return {
      action: 'ineligible',
      label: `Pool #${pool.poolId}`,
      detail: `Your outcome #${bet.outcome} did not match winning outcome #${pool.winningOutcome}.`,
      amount: `${stake.toFixed(2)} OKB`
    };
  }

  return {
    action: 'pending',
    label: `Pool #${pool.poolId}`,
    detail: `Your outcome #${bet.outcome} is waiting for resolution.`,
    amount: `${stake.toFixed(2)} OKB`
  };
};

const getJuryWinningStake = (dispute) => {
  if (dispute.verdict === 1) return toNumber(dispute.votesValid);
  if (dispute.verdict === 2) return toNumber(dispute.votesInvalid);
  if (dispute.verdict === 3) return toNumber(dispute.votesInconclusive);
  return 0;
};

const getJuryClaim = (dispute, vote) => {
  const stake = toNumber(vote?.stake);
  if (!vote || stake <= 0) return null;

  const isResolved = dispute.status === 2 || dispute.status === 3;
  const isInconclusive = dispute.verdict === 3;
  const isWinner = Number(vote.choice) === Number(dispute.verdict);
  const winningStake = getJuryWinningStake(dispute);

  if (vote.claimed) {
    return {
      action: 'claimed',
      label: `Play #${dispute.playId}`,
      detail: `Your ${stake.toFixed(2)} OKB jury stake has already been claimed.`,
      amount: `${stake.toFixed(2)} OKB`
    };
  }

  if (!isResolved) {
    return {
      action: 'pending',
      label: `Play #${dispute.playId}`,
      detail: `Your jury choice #${vote.choice} is waiting for final verdict.`,
      amount: `${stake.toFixed(2)} OKB`
    };
  }

  if (isInconclusive || winningStake === 0) {
    return {
      action: 'jury',
      label: `Play #${dispute.playId}`,
      detail: 'Inconclusive verdict. Jury stakes are refundable through rewards claim.',
      amount: `${stake.toFixed(2)} OKB`
    };
  }

  if (isWinner) {
    const estimatedPayout = (stake * toNumber(dispute.totalJuryStaked)) / winningStake;
    return {
      action: 'jury',
      label: `Play #${dispute.playId}`,
      detail: `Your jury choice matched verdict #${dispute.verdict}.`,
      amount: `${estimatedPayout.toFixed(4)} OKB`
    };
  }

  return {
    action: 'ineligible',
    label: `Play #${dispute.playId}`,
    detail: `Your jury choice #${vote.choice} did not match verdict #${dispute.verdict}.`,
    amount: `${stake.toFixed(2)} OKB`
  };
};

const ClaimRow = ({ item, loading, onAction }) => {
  const actionable = ['payout', 'refund', 'jury'].includes(item.action);
  const actionLabel = item.action === 'refund' ? 'CLAIM REFUND' : item.action === 'jury' ? 'CLAIM JURY' : 'CLAIM PAYOUT';

  return (
    <div className="border border-zinc-800 rounded-lg bg-black/50 p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-white font-bold">{item.label}</span>
          <span className="text-3xs font-mono uppercase tracking-wider text-[#00F5FF]">{item.type}</span>
          <span className="text-3xs font-mono text-[#A8FF35]">{item.amount}</span>
        </div>
        <span className="text-3xs font-mono text-zinc-500 leading-relaxed">{item.detail}</span>
      </div>

      <button
        type="button"
        disabled={!actionable || loading}
        onClick={onAction}
        className="neon-btn px-4 py-2 text-3xs disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {actionable ? actionLabel : item.action.toUpperCase()}
      </button>
    </div>
  );
};

export const ClaimCenter = () => {
  const {
    predictionPools,
    userPoolBets,
    disputes,
    userDisputeVotes,
    claimPayout,
    claimRefund,
    claimJuryRewards,
    fetchPredictionPools,
    fetchDisputes,
    loading
  } = usePrediction();
  const { walletConnected, connectWallet } = useWallet();

  const predictionClaims = predictionPools
    .map((pool) => {
      const claim = getPredictionClaim(pool, userPoolBets[pool.poolId]);
      return claim ? { ...claim, type: 'Prediction', poolId: pool.poolId } : null;
    })
    .filter(Boolean);

  const juryClaims = disputes
    .map((dispute) => {
      const claim = getJuryClaim(dispute, userDisputeVotes[dispute.playId]);
      return claim ? { ...claim, type: 'Jury', playId: dispute.playId } : null;
    })
    .filter(Boolean);

  const claims = [...predictionClaims, ...juryClaims];

  const handleAction = async (item) => {
    if (!walletConnected) {
      await connectWallet();
      return;
    }

    if (item.action === 'payout') await claimPayout(item.poolId);
    if (item.action === 'refund') await claimRefund(item.poolId);
    if (item.action === 'jury') await claimJuryRewards(item.playId);
  };

  const refreshAll = async () => {
    await fetchPredictionPools(true);
    await fetchDisputes(true);
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="section-title">
          <Gift size={14} className="text-[#A8FF35]" /> MY POSITION & CLAIM CENTER
        </h2>

        <button
          type="button"
          onClick={refreshAll}
          disabled={loading}
          className="px-3 py-1.5 rounded-md border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700 text-3xs font-mono uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <div className="glass-panel p-4 bg-[#121214]/40 flex flex-col gap-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border border-zinc-800 rounded-lg bg-black/50 p-3 flex items-start gap-2">
            <Trophy size={14} className="text-[#A8FF35] mt-0.5 shrink-0" />
            <p className="text-3xs font-mono text-zinc-500 leading-relaxed">
              Prediction positions are claimed from the market pool after settlement. You do not need to vote in Tribunal to claim a winning prediction.
            </p>
          </div>
          <div className="border border-zinc-800 rounded-lg bg-black/50 p-3 flex items-start gap-2">
            <ShieldCheck size={14} className="text-[#00F5FF] mt-0.5 shrink-0" />
            <p className="text-3xs font-mono text-zinc-500 leading-relaxed">
              Tribunal voting is a separate optional role. Correct jurors claim from the jury pool, while market winners claim from the prediction pool.
            </p>
          </div>
        </div>

        {!walletConnected ? (
          <div className="border border-zinc-800 rounded-lg bg-black/50 px-4 py-6 text-center text-3xs font-mono text-zinc-500">
            Connect a wallet to see your positions, claimable payouts, refunds, and jury rewards.
          </div>
        ) : claims.length === 0 ? (
          <div className="border border-zinc-800 rounded-lg bg-black/50 px-4 py-6 text-center text-3xs font-mono text-zinc-500">
            No wallet positions found yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {claims.map((item) => (
              <ClaimRow
                key={`${item.type}-${item.poolId || item.playId}`}
                item={item}
                loading={loading}
                onAction={() => handleAction(item)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
