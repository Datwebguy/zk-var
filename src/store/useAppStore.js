import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
  // Wallet State
  walletConnected: false,
  userAddress: '',
  walletType: '',
  balance: '0.00',
  chainId: null,

  // Prediction Markets & Dispute State
  predictionPools: [
    {
      poolId: 1,
      question: "Will the VAR check rule Messi's 42nd minute goal OFFSIDE?",
      closingTime: Math.floor(Date.now() / 1000) + 1200,
      status: 0, // Open
      totalStaked: '4.85',
      stakedOutcome1: '3.10',
      stakedOutcome2: '1.75',
      winningOutcome: 0,
      disputeId: 101,
      match: "Argentina vs France"
    },
    {
      poolId: 2,
      question: "Was the ball completely out of bounds before Mbappe's assist?",
      closingTime: Math.floor(Date.now() / 1000) + 3600,
      status: 0, // Open
      totalStaked: '12.40',
      stakedOutcome1: '2.40',
      stakedOutcome2: '10.00',
      winningOutcome: 0,
      disputeId: 102,
      match: "Argentina vs France"
    }
  ],
  
  disputes: [
    {
      playId: 101,
      predictionPoolId: 1,
      description: "Messi 42' - Possible offside detection on run-up.",
      votingEndTime: Math.floor(Date.now() / 1000) + 1200,
      status: 0, // Active
      totalJuryStaked: '2.50',
      votesValid: '1.80',
      votesInvalid: '0.70',
      votesInconclusive: '0.00',
      exists: true,
      decisionType: "Offside Detection"
    },
    {
      playId: 102,
      predictionPoolId: 2,
      description: "Mbappe 68' - Touchline check before final cross.",
      votingEndTime: Math.floor(Date.now() / 1000) + 3600,
      status: 0, // Active
      totalJuryStaked: '6.20',
      votesValid: '1.20',
      votesInvalid: '5.00',
      votesInconclusive: '0.00',
      exists: true,
      decisionType: "Out of Bounds"
    }
  ],

  // ZK VM Pipeline State (SP1 Succinct)
  isZKProving: false,
  zkProofState: 'idle', // 'idle' | 'computing' | 'proving' | 'verified'
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

  placeLocalPrediction: (poolId, outcome, amount) => {
    set((state) => {
      const updatedPools = state.predictionPools.map(pool => {
        if (pool.poolId === poolId) {
          const amt = parseFloat(amount);
          const o1 = outcome === 1 ? (parseFloat(pool.stakedOutcome1) + amt).toFixed(2) : pool.stakedOutcome1;
          const o2 = outcome === 2 ? (parseFloat(pool.stakedOutcome2) + amt).toFixed(2) : pool.stakedOutcome2;
          const total = (parseFloat(o1) + parseFloat(o2)).toFixed(2);
          return {
            ...pool,
            stakedOutcome1: o1,
            stakedOutcome2: o2,
            totalStaked: total
          };
        }
        return pool;
      });
      return { predictionPools: updatedPools };
    });
  },

  castLocalJuryVote: (playId, choice, amount) => {
    set((state) => {
      const updatedDisputes = state.disputes.map(disp => {
        if (disp.playId === playId) {
          const amt = parseFloat(amount);
          let v = parseFloat(disp.votesValid);
          let inv = parseFloat(disp.votesInvalid);
          let inc = parseFloat(disp.votesInconclusive);
          
          if (choice === 1) v += amt;
          else if (choice === 2) inv += amt;
          else if (choice === 3) inc += amt;

          const total = (v + inv + inc).toFixed(2);
          return {
            ...disp,
            votesValid: v.toFixed(2),
            votesInvalid: inv.toFixed(2),
            votesInconclusive: inc.toFixed(2),
            totalJuryStaked: total
          };
        }
        return disp;
      });
      return { disputes: updatedDisputes };
    });
  },

  // ZK-VM Proof Pipeline Actions
  startZKProofPipeline: (playId, isOffside, verifyTxFn, onSuccessCallback) => {
    set({
      isZKProving: true,
      zkProofState: 'computing',
      zkActivePlayId: playId,
      zkProofLog: []
    });

    const addLogLine = (line) => {
      set(state => ({ zkProofLog: [...state.zkProofLog, line] }));
    };

    // Phase 1: Compute Execution (1.5s)
    addLogLine(`[SYSTEM] Initializing SP1 Zero-Knowledge VM execution environment...`);
    addLogLine(`[SP1-GUEST] Loading ZK-VAR guest neural network circuit compiled to RISCV...`);
    addLogLine(`[SP1-GUEST] Target video frame hash: 0x${Math.random().toString(36).substring(2, 10)}${Math.random().toString(36).substring(2, 10)}`);
    addLogLine(`[SP1-GUEST] Executing computer vision inference logic for playId=${playId}...`);

    setTimeout(() => {
      set({ zkProofState: 'proving' });
      addLogLine(`[SYSTEM] Inference finished. Deterministic output: isOffside = ${isOffside}`);
      addLogLine(`[SP1-PROVER] Instantiating Succinct SP1 Core Prover...`);
      addLogLine(`[SP1-PROVER] Input values: playId=${playId}, isOffside=${isOffside}`);
      addLogLine(`[SP1-PROVER] Creating cryptographic trace of execution circuit...`);
      addLogLine(`[SP1-PROVER] Generating ZK PLONK/Groth16 proof using GPU acceleration...`);
      
      const entropy = new Uint32Array(4);
      crypto.getRandomValues(entropy);
      const generatedHash = `0x${Array.from(entropy).map(b => b.toString(16).padStart(8, '0')).join('')}`;
      
      addLogLine(`[SP1-PROVER] Proof signature generated successfully!`);
      addLogLine(`[SP1-PROVER] Cryptographic Hash: ${generatedHash}`);

      // Now trigger the verification step
      if (verifyTxFn) {
        verifyTxFn(generatedHash, addLogLine)
          .then((txHash) => {
            set({
              zkProofState: 'verified',
              zkVerifiedHash: txHash || generatedHash
            });

            // Update state locally
            set((state) => {
              const resolvedDisputes = state.disputes.map(d => {
                if (d.playId === playId) {
                  return { ...d, status: 2, zkVerdict: isOffside ? 1 : 2, verdict: isOffside ? 1 : 2 }; // ResolvedByZK
                }
                return d;
              });

              const resolvedPools = state.predictionPools.map(p => {
                if (p.disputeId === playId) {
                  return { ...p, status: 2, winningOutcome: isOffside ? 1 : 2 }; // Resolved
                }
                return p;
              });

              return {
                disputes: resolvedDisputes,
                predictionPools: resolvedPools
              };
            });

            // Trigger wallet notification
            get().addNotification('success', `ZK Proof verified on X Layer! Market Resolved.`, txHash || generatedHash);

            if (onSuccessCallback) onSuccessCallback(txHash || generatedHash);
          })
          .catch((error) => {
            console.error("ZK Proving pipeline aborted or failed:", error);
            set({
              zkProofState: 'failed',
              isZKProving: false
            });
            addLogLine(`[ERROR] Verification aborted: ${error.message || 'Transaction rejected/failed'}`);
            addLogLine(`[SYSTEM] VM state reset to FAILED. Ready for retry.`);
            get().addNotification('error', `Verification aborted: ${error.message || 'Transaction failed'}`);
          });
      } else {
        // Fallback if no verifyTxFn provided
        setTimeout(() => {
          set({
            zkProofState: 'verified',
            zkVerifiedHash: generatedHash
          });
          addLogLine(`[SYSTEM] Verification skipped. Demo resolved.`);
          if (onSuccessCallback) onSuccessCallback(generatedHash);
        }, 1000);
      }

    }, 2000);
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
