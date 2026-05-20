import React, { useEffect, useRef, useState } from 'react';
import { Shield, Target, Play, Zap, Cpu } from 'lucide-react';

export const VARPanel = ({ activePlayId = 101 }) => {
  const canvasRef = useRef(null);
  const [telemetry, setTelemetry] = useState({
    attackerSpeed: '32.4 km/h',
    distanceToLine: '+0.12m (Offside)',
    ballVelocity: '82.5 km/h',
    inferenceConfidence: '99.8%',
    frameId: 'FRAME_4812_SEC5'
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId;
    let isVisible = true;

    // Use IntersectionObserver to pause heavy canvas draws when off-screen
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    }, { threshold: 0.1 });

    observer.observe(canvas);

    // Set fixed high-res 16:9 coordinates coordinate space internally
    const width = (canvas.width = 960);
    const height = (canvas.height = 540);

    // Procedural coordinates for the plays scaled to 960x540 (16:9)
    // Play 101: Offside check on attacker
    const play101 = {
      players: [
        { x: 240, y: 240, r: 10, label: 'Attacker (Messi)', team: 'A', isTarget: true },
        { x: 300, y: 195, r: 10, label: 'Defender 1 (Upamecano)', team: 'D', isTarget: false },
        { x: 310, y: 330, r: 10, label: 'Defender 2 (Varane)', team: 'D', isTarget: false },
        { x: 100, y: 270, r: 12, label: 'Goalkeeper (Lloris)', team: 'D', isTarget: false }
      ],
      offsideLineX: 300, // Position of last defender
      ball: { x: 500, y: 150, targetX: 240, targetY: 240 }
    };

    // Play 102: Touchline / Out of bounds check
    const play102 = {
      players: [
        { x: 820, y: 120, r: 10, label: 'Winger (Mbappe)', team: 'A', isTarget: true },
        { x: 780, y: 165, r: 10, label: 'Defender (Molina)', team: 'D', isTarget: false }
      ],
      offsideLineX: 840, // Represents touchline
      ball: { x: 660, y: 330, targetX: 830, targetY: 110 }
    };

    const currentPlay = activePlayId === 101 ? play101 : play102;
    let frame = 0;

    const drawVAR = () => {
      animId = requestAnimationFrame(drawVAR);
      if (!isVisible) return; // Skip rendering when offscreen

      frame++;
      ctx.fillStyle = '#121214';
      ctx.fillRect(0, 0, width, height);

      // 1. Draw glowing grid fields representing spatial camera calibrations
      ctx.strokeStyle = 'rgba(168, 255, 53, 0.03)';
      ctx.lineWidth = 1;
      const step = 25;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 2. Draw Pitch Boundary Lines (glowing perspective field)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 2;
      
      // Touchline / Penalty box outlines depending on active play
      if (activePlayId === 101) {
        // Goal box left side
        ctx.strokeRect(-50, 90, 240, 360);
        ctx.strokeRect(-50, 165, 110, 210);
      } else {
        // Touchline right corner
        ctx.beginPath();
        ctx.moveTo(530, 60);
        ctx.lineTo(930, 60);
        ctx.lineTo(930, 480);
        ctx.stroke();
      }

      // 3. Draw ZK-AI Offside Line / Boundary Plane (Neon green/cyan scanner laser)
      const laserX = currentPlay.offsideLineX;
      ctx.shadowBlur = 15;
      ctx.shadowColor = activePlayId === 101 ? '#A8FF35' : '#00F5FF';
      ctx.strokeStyle = activePlayId === 101 ? 'rgba(168, 255, 53, 0.8)' : 'rgba(0, 245, 255, 0.8)';
      ctx.lineWidth = 3;
      
      ctx.beginPath();
      ctx.moveTo(laserX, 30);
      ctx.lineTo(laserX, height - 30);
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset glow shadow

      // Draw secondary indicator grid
      ctx.fillStyle = activePlayId === 101 ? 'rgba(168, 255, 53, 0.04)' : 'rgba(0, 245, 255, 0.04)';
      ctx.fillRect(0, 30, laserX, height - 60);

      // 4. Draw Ball Trajectory vector (glowing dotted bezier curve)
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#00F5FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(currentPlay.ball.x, currentPlay.ball.y);
      ctx.quadraticCurveTo(
        (currentPlay.ball.x + currentPlay.ball.targetX) / 2, 
        currentPlay.ball.y - 120, 
        currentPlay.ball.targetX, 
        currentPlay.ball.targetY
      );
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash

      // Dynamic animated ball along the vector
      const progress = (frame % 150) / 150;
      const bx = currentPlay.ball.x + (currentPlay.ball.targetX - currentPlay.ball.x) * progress;
      const by = currentPlay.ball.y + (currentPlay.ball.targetY - currentPlay.ball.y) * progress - Math.sin(progress * Math.PI) * 75;
      
      ctx.fillStyle = '#00F5FF';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#00F5FF';
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // 5. Draw Players
      currentPlay.players.forEach(p => {
        const isAttacker = p.team === 'A';
        ctx.fillStyle = isAttacker ? '#00F5FF' : '#FFFFFF';
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();

        // Outer telemetry rings
        ctx.strokeStyle = isAttacker ? 'rgba(0, 245, 255, 0.3)' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + 5 + Math.sin(frame * 0.05) * 3, 0, Math.PI * 2);
        ctx.stroke();

        // AI Bounding box Lock-On for target players
        if (p.isTarget) {
          const size = 35 + Math.sin(frame * 0.08) * 4;
          ctx.strokeStyle = '#A8FF35';
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#A8FF35';
          
          ctx.strokeRect(p.x - size / 2, p.y - size / 2, size, size);
          
          ctx.fillStyle = 'rgba(168, 255, 53, 0.15)';
          ctx.font = '700 10px monospace';
          ctx.fillText("TARGET LOCK [ZK_CORE]", p.x + size / 2 + 6, p.y - 2);
          ctx.shadowBlur = 0;

          // Draw dotted distance marker line to VAR plane
          ctx.setLineDash([2, 2]);
          ctx.strokeStyle = '#A8FF35';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(laserX, p.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Mini player names
        ctx.fillStyle = '#8E8E93';
        ctx.font = '500 10px monospace';
        ctx.fillText(p.label, p.x - 25, p.y - 15);
      });

      // 6. Draw Spatial Scanning UI overlays
      ctx.fillStyle = '#A8FF35';
      ctx.font = '600 12px monospace';
      ctx.fillText(`CAM_1: ZK_VAR_CHECK // PLAY_${activePlayId}`, 30, 45);
      
      ctx.strokeStyle = 'rgba(168, 255, 53, 0.3)';
      ctx.strokeRect(15, 15, width - 30, height - 30);

      // Draw active scanner grid corners
      const borderLen = 20;
      ctx.strokeStyle = '#A8FF35';
      ctx.lineWidth = 2.5;

      const corners = [
        [15, 15, 1, 1],
        [width - 15, 15, -1, 1],
        [15, height - 15, 1, -1],
        [width - 15, height - 15, -1, -1]
      ];
      corners.forEach(([cx, cy, dx, dy]) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + dy * borderLen);
        ctx.lineTo(cx, cy);
        ctx.lineTo(cx + dx * borderLen, cy);
        ctx.stroke();
      });

      // Frame HUD data update
      if (frame % 30 === 0) {
        setTelemetry({
          attackerSpeed: `${(31.2 + Math.random() * 2).toFixed(1)} km/h`,
          distanceToLine: activePlayId === 101 ? `${(0.10 + Math.random() * 0.05).toFixed(2)}m (Offside)` : `touchline gap: ${(0.02 + Math.random() * 0.01).toFixed(3)}m (IN)`,
          ballVelocity: `${(80.5 + Math.random() * 4).toFixed(1)} km/h`,
          inferenceConfidence: `${(99.6 + Math.random() * 0.3).toFixed(2)}%`,
          frameId: `FRAME_4812_SEC${Math.floor(frame / 60)}`
        });
      }
    };

    drawVAR();

    return () => {
      cancelAnimationFrame(animId);
      observer.disconnect();
    };
  }, [activePlayId]);

  return (
    <div className="glass-panel p-6 scanline-overlay flex flex-col gap-6" style={{ width: '100%' }}>
      <div className="flex flex-col xl:flex-row gap-6">
        
        {/* Procedural Spatial Rebuilder Canvas */}
        <div className="flex-1 bg-black rounded-lg overflow-hidden relative" style={{
          width: '100%',
          aspectRatio: '16/9',
          border: '1px solid rgba(168, 255, 53, 0.4)',
          boxShadow: '0 0 20px rgba(168, 255, 53, 0.15)'
        }}>
          <canvas
            ref={canvasRef}
            className="block w-full h-full"
            style={{ objectFit: 'contain' }}
          />
          <div className="absolute bottom-3 left-3 bg-zinc-950/80 px-3 py-1 rounded text-xs font-mono border border-zinc-800 text-glow-green text-[#A8FF35] flex items-center gap-1.5 z-10">
            <Cpu size={12} className="animate-spin" /> Live SP1 Guest Inference Sandbox
          </div>
        </div>

        {/* Telemetry Dashboard Data */}
        <div className="w-full xl:w-64 flex flex-col justify-between gap-4 font-mono">
          <div className="border border-zinc-800 rounded-lg p-4 bg-[#121214]/50 flex flex-col gap-4">
            <h4 className="text-glow-green text-[#A8FF35] text-xs font-heading font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Zap size={14} /> Telemetry Analysis
            </h4>
            
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">FRAME CODE:</span>
                <span className="text-white tabular-nums">{telemetry.frameId}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">ATTACKER VEL:</span>
                <span className="text-white tabular-nums">{telemetry.attackerSpeed}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">VAR GAP PLANE:</span>
                <span className="text-glow-cyan text-[#00F5FF] tabular-nums font-bold">{telemetry.distanceToLine}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-zinc-500">BALL SPEED:</span>
                <span className="text-white tabular-nums">{telemetry.ballVelocity}</span>
              </div>
              <div className="h-px bg-zinc-800/80 my-1" />
              <div className="flex justify-between items-center text-xs">
                <span className="text-[#A8FF35] font-bold">AI CONFIDENCE:</span>
                <span className="text-[#A8FF35] font-bold tabular-nums">{telemetry.inferenceConfidence}</span>
              </div>
            </div>
          </div>

          <div className="text-3xs text-zinc-500 flex flex-col gap-2">
            <span className="flex items-center gap-1.5"><Shield size={12} className="text-[#A8FF35]" /> ZK-VM Verifiable Inference: SP1 enabled.</span>
            <span className="flex items-center gap-1.5"><Target size={12} className="text-[#00F5FF]" /> Direct on-chain resolution via X Layer.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
