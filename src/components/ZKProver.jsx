import { useEffect, useRef } from 'react';
import { useZKProof } from '../hooks/useZKProof';
import { Terminal, ShieldCheck, Activity, Cpu } from 'lucide-react';
import { truncateAddress, CONTRACT_ADDRESSES, XLAYER_CHAIN_ID } from '../utils/contractHelpers';

export const ZKProver = () => {
  const {
    isZKProving,
    zkProofState,
    zkProofLog,
    zkVerifiedHash,
    txLoading,
    resetZKProofPipeline
  } = useZKProof();

  const terminalLogRef = useRef(null);
  const canvasRef = useRef(null);

  // Default calm logs shown when the prover is idle (waiting for a trigger)
  const defaultLogs = [
    "[SYSTEM] SP1 proof pipeline configured.",
    `[SYSTEM] Verifier Contract: ${CONTRACT_ADDRESSES.ZKVerifier}`,
    `[SYSTEM] Target Network: X Layer Mainnet (Chain ID: ${XLAYER_CHAIN_ID})`,
    "[SYSTEM] Standing by for Fan Jury Dispute triggers..."
  ];

  const logsToRender = isZKProving ? zkProofLog : defaultLogs;

  // Auto-scroll terminal log container directly to bottom without viewport jumping
  useEffect(() => {
    if (terminalLogRef.current) {
      terminalLogRef.current.scrollTop = terminalLogRef.current.scrollHeight;
    }
  }, [logsToRender]);


  // Graphic pipeline animator for ZK particles & idle holographic scans
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId;
    const width = (canvas.width = 400);
    const height = (canvas.height = 120);
    
    // Core node
    const coreX = width / 2;
    const coreY = height / 2;
    
    // Particles pool
    const particles = [];
    const maxParticles = 40;

    class ProvingParticle {
      constructor() {
        this.reset();
      }

      reset() {
        // Spawn around the edges
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 100 + 60;
        this.x = coreX + Math.cos(angle) * dist;
        this.y = coreY + Math.sin(angle) * dist;
        this.speed = Math.random() * 1.6 + 1.4;
        this.size = Math.random() * 2 + 0.8;
        this.color = Math.random() > 0.3 ? 'rgba(168, 255, 53, 0.7)' : 'rgba(0, 245, 255, 0.7)';
      }

      update() {
        // Path toward core node
        const dx = coreX - this.x;
        const dy = coreY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 4) {
          this.reset();
        } else {
          this.x += (dx / dist) * this.speed;
          this.y += (dy / dist) * this.speed;
        }
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
      }
    }

    for (let i = 0; i < maxParticles; i++) {
      particles.push(new ProvingParticle());
    }

    const animate = () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      if (isZKProving) {
        // Core target ring
        ctx.strokeStyle = zkProofState === 'verified' ? '#A8FF35' : '#00F5FF';
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = zkProofState === 'verified' ? '#A8FF35' : '#00F5FF';
        
        ctx.beginPath();
        ctx.arc(coreX, coreY, 16 + Math.sin(Date.now() * 0.01) * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Pulse central core fill
        ctx.fillStyle = zkProofState === 'verified' ? 'rgba(168, 255, 53, 0.2)' : 'rgba(0, 245, 255, 0.2)';
        ctx.beginPath();
        ctx.arc(coreX, coreY, 12, 0, Math.PI * 2);
        ctx.fill();

        // Matrix computation lines in Act 1
        if (zkProofState === 'computing') {
          ctx.strokeStyle = 'rgba(0, 245, 255, 0.08)';
          ctx.lineWidth = 1;
          for (let i = 20; i < width; i += 30) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, height);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(0, 245, 255, 0.4)';
          ctx.font = '8px monospace';
          ctx.fillText(`COMPILING RISC-V CIRCUIT...`, 15, 20);
          ctx.fillText(`CYCLE_STAT: ${284900 + Math.floor(Math.random() * 50)}`, 15, 32);
        }

        // Act 2: Particles flow inward
        if (zkProofState === 'proving' || zkProofState === 'computing') {
          particles.forEach(p => {
            p.update();
            p.draw();
          });
        }

        // Act 3: Verification success pulse
        if (zkProofState === 'verified') {
          ctx.fillStyle = '#A8FF35';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('ZK PROOF VERIFIED ON X LAYER', coreX, coreY + 36);
          ctx.textAlign = 'left'; // Reset
        }
      } else {
        // Draw calm grid helper background
        ctx.strokeStyle = 'rgba(0, 245, 255, 0.02)';
        ctx.lineWidth = 1;
        for (let i = 20; i < width; i += 30) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, height);
          ctx.stroke();
        }

        // Idle calm holographic scan bar
        ctx.strokeStyle = 'rgba(0, 245, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        const scanY = coreY + Math.sin(Date.now() * 0.002) * (height / 2 - 15);
        ctx.moveTo(15, scanY);
        ctx.lineTo(width - 15, scanY);
        ctx.stroke();

        ctx.fillStyle = 'rgba(0, 245, 255, 0.6)';
        ctx.font = '500 8.5px monospace';
        ctx.fillText(`SP1 PROVER STATS: STANDBY`, 20, 30);
        ctx.fillText(`TARGET: xlayer_mainnet_${XLAYER_CHAIN_ID}`, 20, 45);
        ctx.fillText(`VERIFIER CONTRACT: ${CONTRACT_ADDRESSES.ZKVerifier.substring(0, 8)}...`, 20, 60);

        // Core visual target in Standby mode
        ctx.strokeStyle = 'rgba(0, 245, 255, 0.25)';
        ctx.beginPath();
        ctx.arc(coreX + 110, coreY, 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(0, 245, 255, 0.05)';
        ctx.fill();
        
        ctx.fillStyle = 'rgba(0, 245, 255, 0.4)';
        ctx.beginPath();
        ctx.arc(coreX + 110, coreY, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isZKProving, zkProofState]);

  return (
    <div className="glass-panel flex flex-col relative overflow-hidden" style={{
      border: isZKProving ? '1px solid #A8FF35' : '1px solid rgba(168, 255, 53, 0.2)',
      boxShadow: isZKProving ? '0 0 20px rgba(168, 255, 53, 0.15)' : 'none'
    }}>
      
      {/* Header HUD */}
      <div className="flex justify-between items-center border-b border-zinc-800/80 pb-3 mb-4">
        <div className="flex items-center gap-2 text-glow-green text-[#A8FF35]">
          <Cpu className={isZKProving ? "animate-spin text-[#A8FF35]" : "text-[#A8FF35]"} size={16} />
          <span className="font-heading font-bold text-xs tracking-wider uppercase">Succinct SP1 ZK-VM</span>
        </div>
        <div className="text-3xs font-mono text-zinc-500 flex items-center gap-1.5">
          <Activity size={10} className="text-[#00F5FF] animate-pulse" /> state: {isZKProving ? zkProofState.toUpperCase() : 'STANDBY'}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        
        {/* Top visual graphic component */}
        <div className="flex justify-center bg-black rounded-lg border border-zinc-900 relative overflow-hidden h-[100px]">
          <canvas ref={canvasRef} className="block w-full h-full" />
          
          {zkProofState === 'verified' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="bg-[#121214] border border-[#A8FF35] rounded-full p-2 shadow-[0_0_20px_rgba(168,255,53,0.3)]">
                <ShieldCheck size={32} className="text-[#A8FF35]" />
              </div>
            </div>
          )}
        </div>

        {/* Terminal Console Logs */}
        <div className="flex flex-col gap-1.5">
          <label className="hud-label"><Terminal size={12} /> Cryptographic Proof Pipeline Logs</label>
          <div ref={terminalLogRef} className="zk-terminal-log" style={{ height: '140px' }}>
            {logsToRender.map((line, idx) => (
              <div 
                key={idx} 
                className={`zk-terminal-line ${line.startsWith('[SYSTEM]') ? 'system' : line.includes('SUCCESS') || line.includes('verified') ? 'success' : ''}`}
              >
                {line}
              </div>
            ))}
          </div>
        </div>


        {/* Bottom actions */}
        {isZKProving && (
          <div className="flex justify-between items-center gap-3 bg-[#121214]/80 border border-zinc-800/80 rounded-lg p-3 font-mono text-3xs">
            <div className="flex-1 min-w-0">
              <span className="text-zinc-500 block mb-0.5">PROOF HASH:</span>
              <span className="text-glow-cyan text-[#00F5FF] break-all select-all font-bold tabular-nums">
                {zkVerifiedHash ? truncateAddress(zkVerifiedHash) : 'GENERATING...'}
              </span>
            </div>
            
            <button
              onClick={resetZKProofPipeline}
              disabled={zkProofState !== 'verified' || txLoading}
              className="neon-btn px-3 py-1.5 disabled:opacity-40 text-3xs font-bold"
            >
              {txLoading ? 'PENDING...' : 'DISMISS HUD'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
