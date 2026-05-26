import { useEffect, useRef } from 'react';

export const AnimatedBackground = () => {
  const canvasRef = useRef(null);
  
  // Parallax tracking
  const mouseRef = useRef({
    currentX: 0,
    currentY: 0,
    targetX: 0,
    targetY: 0
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Particle pool setup (capped for mobile/performance)
    const maxParticles = Math.min(width < 768 ? 250 : 800, 800);
    const particles = [];

    class Particle {
      constructor() {
        this.reset();
      }

      reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.z = Math.random() * 2 + 0.1; // Simulated depth
        this.size = Math.random() * 1.5 + 0.5;
        this.speedX = (Math.random() * 0.4 - 0.2) * this.z;
        this.speedY = (Math.random() * -0.5 - 0.2) * this.z; // Flow upward
        this.color = Math.random() > 0.4 
          ? 'rgba(168, 255, 53, ' + (Math.random() * 0.15 + 0.05) + ')'  // Lime Green
          : 'rgba(0, 245, 255, ' + (Math.random() * 0.15 + 0.05) + ')';  // ZK-Cyan
      }

      update(mx, my) {
        // Apply wind/movement speed + subtle mouse parallax based on depth
        this.x += this.speedX - mx * 0.04 * this.z;
        this.y += this.speedY - my * 0.04 * this.z;

        // Wrap around boundaries
        if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
          this.reset();
          // Spawn at bottom if moving up
          if (this.speedY < 0) this.y = height;
        }
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * this.z, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
      }
    }

    // Populate initial particle array
    for (let i = 0; i < maxParticles; i++) {
      particles.push(new Particle());
    }

    // Mouse movement listener
    const handleMouseMove = (e) => {
      const x = (e.clientX - width / 2) / (width / 2);
      const y = (e.clientY - height / 2) / (height / 2);
      mouseRef.current.targetX = x;
      mouseRef.current.targetY = y;
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Resize listener
    const handleResize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Grid rendering parameters
    const gridSpacing = 45;
    let lastTime = 0;
    const fpsInterval = 1000 / 60; // Locked 60fps throttle

    const render = (time) => {
      animationId = requestAnimationFrame(render);

      // Throttling for 60fps delta-time lock
      const elapsed = time - lastTime;
      if (elapsed < fpsInterval) return;
      lastTime = time - (elapsed % fpsInterval);

      // Clear canvas with deep absolute carbon black
      ctx.fillStyle = '#0A0A0B';
      ctx.fillRect(0, 0, width, height);

      // LERP interpolation for ultra-smooth parallax physics
      const m = mouseRef.current;
      m.currentX += (m.targetX - m.currentX) * 0.08;
      m.currentY += (m.targetY - m.currentY) * 0.08;

      const mx = m.currentX;
      const my = m.currentY;

      // Draw futuristic 3D perspective cyber-grid lines in background
      ctx.lineWidth = 1.0;
      
      const horizonY = height * 0.45 + my * 20;
      const gridColor1 = 'rgba(168, 255, 53, 0.15)'; // Increased opacity as requested
      const gridColor2 = 'rgba(0, 245, 255, 0.08)';  // ZK Cyan helper grid

      // 1. Collect perspective horizontal line t-values
      const horizonLines = [];
      for (let y = horizonY; y < height; y += (height - horizonY) / 10) {
        horizonLines.push(y);
      }

      // Draw Grid base floor lines (converging perspectives)
      for (let i = -width; i < width * 2; i += gridSpacing * 2) {
        const p0x = width / 2 + mx * 80;
        const p1x = i - mx * 120;

        ctx.beginPath();
        ctx.moveTo(p0x, horizonY);
        ctx.lineTo(p1x, height);
        ctx.strokeStyle = gridColor1;
        ctx.stroke();

        // Draw glowing nodes at each perspective intersection point
        horizonLines.forEach(h => {
          const t = (h - horizonY) / (height - horizonY);
          const x = p0x + (p1x - p0x) * t;
          
          ctx.beginPath();
          ctx.arc(x, h, 1.8 * (t + 0.2), 0, Math.PI * 2);
          ctx.fillStyle = Math.random() > 0.85 ? '#00F5FF' : '#A8FF35';
          ctx.fill();
        });
      }

      // Draw grid horizon rings
      horizonLines.forEach(h => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        ctx.lineTo(width, h);
        ctx.strokeStyle = gridColor2;
        ctx.stroke();
      });

      // Update and draw particles (simulated ZK bits)
      for (let i = 0; i < maxParticles; i++) {
        particles[i].update(mx, my);
        particles[i].draw();
      }
    };

    render(0);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0, // Set to 0 as requested
        pointerEvents: 'none',
        display: 'block'
      }}
    />
  );
};
