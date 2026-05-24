import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
  // Wallet State
  walletConnected: false,
  userAddress: '',
  walletType: '',
  balance: '0.00',
  chainId: null,

  // Prediction Markets & Dispute State
  predictionPools: [],
  disputes: [],
  userPoolBets: {},
  userDisputeVotes: {},
  contractOwner: '',

  // ZK VM Pipeline State (SP1 Succinct)
  isZKProving: false,
  zkProofState: 'idle', // 'idle' | 'proving' | 'verified' | 'failed'
  zkProofLog: [],
  zkVerifiedHash: '',
  zkActivePlayId: null,

  // Neon Notifications State
  notifications: [],

  // --- ACTIONS ---

  // Notifications Actions
  addNotification: (type, message, txHash = '') => {
    const id = Date.now();
    const newNotif = { id, type, message, txHash };
    set((state) => ({
      notifications: [...state.notifications, newNotif]
    }));
    
    // Automatically clear notifications after 5 seconds
    setTimeout(() => {
      get().removeNotification(id);
    }, 5500);
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter(n => n.id !== id)
    }));
  },

  // Wallet Connection Actions
  setWalletState: (walletState) => {
    set(walletState);
  },

  disconnectWallet: () => {
    set({
      walletConnected: false,
      userAddress: '',
      walletType: '',
      balance: '0.00',
      chainId: null
    });
    get().addNotification('error', 'Wallet disconnected');
  },

  // Predictions & Voting Actions
  setPredictionPools: (pools) => set({ predictionPools: pools }),
  
  setDisputes: (disputes) => set({ disputes: disputes }),

  setUserPoolBets: (bets) => set({ userPoolBets: bets }),

  setUserDisputeVotes: (votes) => set({ userDisputeVotes: votes }),

  setContractOwner: (contractOwner) => set({ contractOwner }),

  // ZK-VM Proof Pipeline Actions
  startZKProofPipeline: (playId, proveAndVerifyFn, onSuccessCallback) => {
    set({
      isZKProving: true,
      zkProofState: 'proving',
      zkActivePlayId: playId,
      zkProofLog: []
    });

    const addLogLine = (line) => {
      set(state => ({ zkProofLog: [...state.zkProofLog, line] }));
    };

    addLogLine(`[SYSTEM] Starting real ZK referee settlement for playId=${playId}.`);
    addLogLine(`[SYSTEM] Waiting for prover service and on-chain verifier confirmation.`);

    if (proveAndVerifyFn) {
      proveAndVerifyFn(addLogLine)
        .then((result) => {
          const txHash = result?.txHash || '';
          const isOffside = Boolean(result?.isOffside);
          set({
            zkProofState: 'verified',
            zkVerifiedHash: txHash
          });

          set((state) => {
            const resolvedDisputes = state.disputes.map(d => {
              if (d.playId === playId) {
                return { ...d, status: 2, zkVerdict: isOffside ? 1 : 2, verdict: isOffside ? 1 : 2 };
              }
              return d;
            });

            const resolvedPools = state.predictionPools.map(p => {
              if (p.disputeId === playId) {
                return { ...p, status: 2, winningOutcome: isOffside ? 1 : 2 };
              }
              return p;
            });

            return {
              disputes: resolvedDisputes,
              predictionPools: resolvedPools
            };
          });

          get().addNotification('success', `ZK proof verified on X Layer. Market resolved.`, txHash);

          if (onSuccessCallback) onSuccessCallback(txHash);
        })
        .catch((error) => {
          console.error("ZK proving pipeline aborted or failed:", error);
          set({
            zkProofState: 'failed',
            isZKProving: false
          });
          addLogLine(`[ERROR] Verification aborted: ${error.message || 'Transaction rejected/failed'}`);
          addLogLine(`[SYSTEM] Proof flow failed. Ready for retry after fixing input/prover/on-chain configuration.`);
          get().addNotification('error', `Verification aborted: ${error.message || 'Transaction failed'}`);
        });
    }
  },

  resetZKProofPipeline: () => {
    set({
      isZKProving: false,
      zkProofState: 'idle',
      zkProofLog: [],
      zkVerifiedHash: '',
      zkActivePlayId: null
    });
  }
}));
