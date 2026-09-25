import { useEffect, useRef } from 'react';

/* ═══════════════════════════════════════════════════════════════════════
   ParticleBackground — Floating geometric shapes + mesh network
   ═══════════════════════════════════════════════════════════════════════
   Draws:
     1. Floating hexagons, circles, and shield outlines
     2. Connected particle mesh network
     3. Soft radial gradient blobs that pulse
     4. Subtle grid overlay
   All reactive to mouse movement for parallax depth.
   ═══════════════════════════════════════════════════════════════════════ */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseAlpha: number;
}

interface FloatingShape {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotationSpeed: number;
  type: 'hexagon' | 'circle' | 'shield' | 'diamond' | 'ring';
  alpha: number;
  parallaxFactor: number;  // how much mouse affects it (depth)
}

interface GlowOrb {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  hue: number;  // 0-360
  alpha: number;
  pulseSpeed: number;
  pulsePhase: number;
}

function drawHexagon(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const px = x + size * Math.cos(angle);
    const py = y + size * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawShield(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.bezierCurveTo(x + size * 0.8, y - size * 0.7, x + size, y - size * 0.1, x + size * 0.7, y + size * 0.5);
  ctx.quadraticCurveTo(x, y + size, x, y + size);
  ctx.quadraticCurveTo(x, y + size, x - size * 0.7, y + size * 0.5);
  ctx.bezierCurveTo(x - size, y - size * 0.1, x - size * 0.8, y - size * 0.7, x, y - size);
  ctx.closePath();
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x + size * 0.6, y);
  ctx.lineTo(x, y + size);
  ctx.lineTo(x - size * 0.6, y);
  ctx.closePath();
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);
    let time = 0;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    // ── Particle mesh network ──────────────────────────────────────
    const particleCount = Math.min(50, Math.floor((width * height) / 28000));
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        radius: Math.random() * 1.8 + 0.6,
        baseAlpha: Math.random() * 0.35 + 0.15,
      });
    }

    // ── Floating geometric shapes ──────────────────────────────────
    const shapeTypes: FloatingShape['type'][] = ['hexagon', 'circle', 'shield', 'diamond', 'ring'];
    const shapeCount = Math.min(18, Math.floor((width * height) / 80000));
    const shapes: FloatingShape[] = [];

    for (let i = 0; i < shapeCount; i++) {
      shapes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.15,
        size: Math.random() * 30 + 15,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.003,
        type: shapeTypes[Math.floor(Math.random() * shapeTypes.length)],
        alpha: Math.random() * 0.06 + 0.02,
        parallaxFactor: Math.random() * 0.5 + 0.1,
      });
    }

    // ── Glow orbs (soft color blobs) ───────────────────────────────
    const orbCount = 4;
    const orbs: GlowOrb[] = [];
    const orbHues = [145, 155, 130, 160]; // greens and teals
    for (let i = 0; i < orbCount; i++) {
      orbs.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 200 + 150,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.12,
        hue: orbHues[i % orbHues.length],
        alpha: 0.04 + Math.random() * 0.03,
        pulseSpeed: 0.005 + Math.random() * 0.008,
        pulsePhase: Math.random() * Math.PI * 2,
      });
    }

    let mouseX = -1000;
    let mouseY = -1000;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    window.addEventListener('mousemove', handleMouseMove);

    const render = () => {
      time += 0.016; // ~60fps
      ctx.clearRect(0, 0, width, height);

      // ── Layer 1: Glow orbs (deepest) ───────────────────────────
      for (const orb of orbs) {
        orb.x += orb.vx;
        orb.y += orb.vy;

        // Bounce at edges
        if (orb.x < -orb.radius) orb.x = width + orb.radius;
        if (orb.x > width + orb.radius) orb.x = -orb.radius;
        if (orb.y < -orb.radius) orb.y = height + orb.radius;
        if (orb.y > height + orb.radius) orb.y = -orb.radius;

        const pulse = Math.sin(time * orb.pulseSpeed + orb.pulsePhase) * 0.3 + 0.7;
        const currentAlpha = orb.alpha * pulse;
        const currentRadius = orb.radius * (0.85 + pulse * 0.15);

        const gradient = ctx.createRadialGradient(
          orb.x, orb.y, 0,
          orb.x, orb.y, currentRadius,
        );
        gradient.addColorStop(0, `hsla(${orb.hue}, 40%, 35%, ${currentAlpha})`);
        gradient.addColorStop(0.5, `hsla(${orb.hue}, 35%, 30%, ${currentAlpha * 0.4})`);
        gradient.addColorStop(1, `hsla(${orb.hue}, 30%, 25%, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── Layer 2: Subtle dot grid ───────────────────────────────
      const gridSize = 48;
      const dotRadius = 0.8;
      ctx.fillStyle = 'rgba(15, 44, 35, 0.04)';
      for (let x = gridSize; x < width; x += gridSize) {
        for (let y = gridSize; y < height; y += gridSize) {
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // ── Layer 3: Floating shapes ───────────────────────────────
      for (const shape of shapes) {
        shape.x += shape.vx;
        shape.y += shape.vy;
        shape.rotation += shape.rotationSpeed;

        // Wrap around edges
        if (shape.x < -shape.size * 2) shape.x = width + shape.size;
        if (shape.x > width + shape.size * 2) shape.x = -shape.size;
        if (shape.y < -shape.size * 2) shape.y = height + shape.size;
        if (shape.y > height + shape.size * 2) shape.y = -shape.size;

        // Mouse parallax
        const dx = mouseX - shape.x;
        const dy = mouseY - shape.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        let drawX = shape.x;
        let drawY = shape.y;
        if (dist < 300) {
          const push = (1 - dist / 300) * shape.parallaxFactor * 15;
          drawX -= (dx / dist) * push;
          drawY -= (dy / dist) * push;
        }

        // Gentle breathing effect on alpha
        const breathe = Math.sin(time * 0.8 + shape.x * 0.01) * 0.3 + 0.7;
        const alpha = shape.alpha * breathe;

        ctx.save();
        ctx.translate(drawX, drawY);
        ctx.rotate(shape.rotation);
        ctx.strokeStyle = `rgba(47, 122, 79, ${alpha})`;
        ctx.lineWidth = 1;

        switch (shape.type) {
          case 'hexagon':
            drawHexagon(ctx, 0, 0, shape.size);
            ctx.stroke();
            break;
          case 'circle':
            ctx.beginPath();
            ctx.arc(0, 0, shape.size, 0, Math.PI * 2);
            ctx.stroke();
            break;
          case 'shield':
            drawShield(ctx, 0, 0, shape.size);
            ctx.stroke();
            break;
          case 'diamond':
            drawDiamond(ctx, 0, 0, shape.size);
            ctx.stroke();
            break;
          case 'ring':
            ctx.beginPath();
            ctx.arc(0, 0, shape.size, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, shape.size * 0.6, 0, Math.PI * 2);
            ctx.stroke();
            break;
        }

        ctx.restore();
      }

      // ── Layer 4: Particle mesh ─────────────────────────────────
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        else if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        else if (p.y > height) p.y = 0;

        // Mouse interaction
        const dxM = p.x - mouseX;
        const dyM = p.y - mouseY;
        const distM = Math.sqrt(dxM * dxM + dyM * dyM);
        if (distM < 150) {
          const force = (1 - distM / 150) * 1.2;
          p.x += (dxM / distM) * force;
          p.y += (dyM / distM) * force;
        }

        // Draw particle dot with a glow
        const glowAlpha = p.baseAlpha * 0.15;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
        glow.addColorStop(0, `rgba(47, 122, 79, ${glowAlpha})`);
        glow.addColorStop(1, 'rgba(47, 122, 79, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(47, 122, 79, ${p.baseAlpha * 0.4})`;
        ctx.fill();

        // Connect nearby particles with gradient lines
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 150) {
            const lineAlpha = (1 - dist / 150) * 0.06;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(47, 122, 79, ${lineAlpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }

      // ── Layer 5: Mouse trail glow ──────────────────────────────
      if (mouseX > 0 && mouseY > 0) {
        const mouseGlow = ctx.createRadialGradient(
          mouseX, mouseY, 0,
          mouseX, mouseY, 180,
        );
        mouseGlow.addColorStop(0, 'rgba(47, 122, 79, 0.03)');
        mouseGlow.addColorStop(0.5, 'rgba(47, 122, 79, 0.015)');
        mouseGlow.addColorStop(1, 'rgba(47, 122, 79, 0)');
        ctx.fillStyle = mouseGlow;
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 180, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="particle-canvas"
      aria-hidden="true"
    />
  );
}
