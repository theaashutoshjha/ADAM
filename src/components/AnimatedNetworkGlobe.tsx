import React, { useEffect, useRef } from 'react';

interface NetworkNode {
  lat: number; // radians
  lon: number; // radians
  color: string;
  size: number;
}

interface NetworkArc {
  from: number;
  to: number;
  speed: number;
  packetPos: number; // 0 to 1
}

export const AnimatedNetworkGlobe: React.FC<{
  size?: number;
  className?: string;
}> = ({ size = 220, className = '' }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let rotation = 0;
    let orbitAngle = 0;

    // Dimensions: wider canvas (300 x 220) so the outer tilted orbit never clips
    const canvasW = 300;
    const canvasH = 220;
    const cx = canvasW / 2;
    const cy = canvasH / 2;
    const radius = 68; // Core sphere radius

    // Constellation nodes positioned across the globe
    const nodes: NetworkNode[] = [
      { lat: 0.28, lon: 0.6, color: '#ffffff', size: 3.5 },
      { lat: 0.45, lon: 0.85, color: '#d946ef', size: 3.2 }, // Magenta/purple as in screenshot
      { lat: -0.22, lon: 0.35, color: '#00f0ff', size: 3.0 },
      { lat: 0.08, lon: 1.45, color: '#00f0ff', size: 3.0 },
      { lat: -0.35, lon: 1.15, color: '#00f0ff', size: 2.8 },
      { lat: 0.38, lon: 1.95, color: '#ffffff', size: 3.2 },
      { lat: -0.15, lon: 2.35, color: '#00f0ff', size: 2.8 },
      { lat: 0.52, lon: 2.65, color: '#d946ef', size: 3.0 },
      { lat: 0.12, lon: 3.14, color: '#ffffff', size: 3.0 },
      { lat: -0.3, lon: 3.8, color: '#00f0ff', size: 2.8 },
      { lat: 0.42, lon: 4.4, color: '#a855f7', size: 3.0 },
      { lat: -0.1, lon: 4.95, color: '#00f0ff', size: 3.2 },
      { lat: 0.25, lon: 5.4, color: '#ffffff', size: 3.2 },
      { lat: -0.28, lon: 5.9, color: '#00f0ff', size: 2.8 },
    ];

    // Connection arcs between nodes
    const arcs: NetworkArc[] = [
      { from: 0, to: 1, speed: 0.012, packetPos: 0.1 },
      { from: 0, to: 2, speed: 0.015, packetPos: 0.4 },
      { from: 1, to: 3, speed: 0.01, packetPos: 0.7 },
      { from: 2, to: 4, speed: 0.014, packetPos: 0.2 },
      { from: 3, to: 5, speed: 0.011, packetPos: 0.6 },
      { from: 5, to: 7, speed: 0.013, packetPos: 0.35 },
      { from: 6, to: 7, speed: 0.009, packetPos: 0.8 },
      { from: 8, to: 10, speed: 0.012, packetPos: 0.5 },
      { from: 10, to: 12, speed: 0.014, packetPos: 0.25 },
    ];

    // Project (lat, lon) on 3D sphere to 2D screen coordinates
    function projectSphere(lat: number, lon: number, r: number, rot: number) {
      // Rotate by current rotation angle around Y axis
      const theta = lon + rot;
      const x0 = r * Math.cos(lat) * Math.sin(theta);
      const y0 = -r * Math.sin(lat);
      const z0 = r * Math.cos(lat) * Math.cos(theta);

      return {
        x: cx + x0,
        y: cy + y0,
        z: z0,
        visible: z0 > -5,
      };
    }

    const render = () => {
      rotation += 0.007; // Smooth steady rotation
      orbitAngle += 0.018; // Satellite orbit speed

      ctx.clearRect(0, 0, canvasW, canvasH);

      // --- 1. BACK HALF OF ORBIT (behind globe) ---
      const orbitRx = radius * 1.48;
      const orbitRy = radius * 0.46;
      const orbitTilt = -0.36; // Angle of inclined orbit

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(orbitTilt);

      // Draw back half of dashed orbit ellipse (top half: angles Math.PI to 2*Math.PI)
      ctx.beginPath();
      ctx.ellipse(0, 0, orbitRx, orbitRy, 0, Math.PI, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // --- 2. CORE SPHERE BASE (Holographic Cyber Gradient) ---
      const sphereGrad = ctx.createRadialGradient(
        cx - radius * 0.2,
        cy - radius * 0.2,
        radius * 0.1,
        cx,
        cy,
        radius
      );
      sphereGrad.addColorStop(0, '#0c2452');
      sphereGrad.addColorStop(0.5, '#071536');
      sphereGrad.addColorStop(0.85, '#040b20');
      sphereGrad.addColorStop(1, '#020614');

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = sphereGrad;
      ctx.fill();

      // --- 3. INTERNAL SPHERE ELEMENTS (Clipped to Sphere Circle) ---
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      // A. Rotating Longitude Meridians (Curved 3D Arcs)
      const meridianCount = 10;
      for (let m = 0; m < meridianCount; m++) {
        const mAngle = (m / meridianCount) * Math.PI * 2 + rotation;
        // Project center and curvature of meridian ellipse on screen
        const cosAngle = Math.sin(mAngle); // -1 to 1
        const rx = Math.abs(radius * cosAngle);

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, radius, 0, 0, Math.PI * 2);
        // Fade lines that are at the edge
        const isFacing = Math.cos(mAngle) > -0.2;
        ctx.strokeStyle = isFacing ? 'rgba(0, 240, 255, 0.28)' : 'rgba(0, 240, 255, 0.08)';
        ctx.lineWidth = 1.0;
        ctx.stroke();
      }

      // Central vertical prime meridian
      ctx.beginPath();
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      // B. Horizontal Equator Line (Solid Cyan across diameter)
      ctx.beginPath();
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.4;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 4;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // C. Upper and Lower Dashed Latitude Parallels (exact match to screenshot)
      const latOffsets = [
        { yOffset: -radius * 0.42, rParallel: radius * 0.9, ry: radius * 0.16 }, // Upper parallel
        { yOffset: radius * 0.42, rParallel: radius * 0.9, ry: radius * 0.16 },  // Lower parallel
      ];

      latOffsets.forEach(({ yOffset, rParallel, ry }) => {
        ctx.beginPath();
        ctx.ellipse(cx, cy + yOffset, rParallel, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.lineWidth = 1.0;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // D. Draw Connecting Arcs & Flowing Data Packets
      arcs.forEach((arc) => {
        const n1 = nodes[arc.from];
        const n2 = nodes[arc.to];
        if (!n1 || !n2) return;

        const p1 = projectSphere(n1.lat, n1.lon, radius, rotation);
        const p2 = projectSphere(n2.lat, n2.lon, radius, rotation);

        if (p1.visible && p2.visible) {
          const midX = (p1.x + p2.x) / 2;
          const midY = (p1.y + p2.y) / 2 - radius * 0.18;

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.quadraticCurveTo(midX, midY, p2.x, p2.y);
          ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
          ctx.lineWidth = 0.9;
          ctx.stroke();

          // Data packet travelling on arc
          arc.packetPos = (arc.packetPos + arc.speed) % 1;
          const t = arc.packetPos;
          const invT = 1 - t;
          const px = invT * invT * p1.x + 2 * invT * t * midX + t * t * p2.x;
          const py = invT * invT * p1.y + 2 * invT * t * midY + t * t * p2.y;

          ctx.beginPath();
          ctx.arc(px, py, 1.8, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#00f0ff';
          ctx.shadowBlur = 6;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      // E. Draw Constellation Nodes (White, Magenta, Cyan dots with specular core)
      nodes.forEach((node) => {
        const p = projectSphere(node.lat, node.lon, radius, rotation);
        if (p.visible) {
          const depthAlpha = Math.min(1, Math.max(0.3, (p.z + radius) / (2 * radius)));
          const currentSize = node.size * (0.8 + depthAlpha * 0.3);

          // Outer Glow
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize * 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(0, 240, 255, ${depthAlpha * 0.22})`;
          ctx.fill();

          // Core Node Dot
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
          ctx.fillStyle = node.color;
          ctx.shadowColor = node.color;
          ctx.shadowBlur = 8;
          ctx.fill();
          ctx.shadowBlur = 0;

          // Inner Specular White Glint
          ctx.beginPath();
          ctx.arc(p.x, p.y, currentSize * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      });

      ctx.restore(); // Restore clip

      // --- 4. OUTER SPHERE RIM (Crisp Glowing Cyan Circle) ---
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.8;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 12;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // --- 5. FRONT HALF OF ORBIT (sweeping in front of globe with satellite) ---
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(orbitTilt);

      // Draw front half of dashed orbit ellipse (bottom half: angles 0 to Math.PI)
      ctx.beginPath();
      ctx.ellipse(0, 0, orbitRx, orbitRy, 0, 0, Math.PI);
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.65)';
      ctx.lineWidth = 1.4;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Satellite position on inclined orbit
      const satX = orbitRx * Math.cos(orbitAngle);
      const satY = orbitRy * Math.sin(orbitAngle);

      // Satellite Motion Trail Particles
      for (let trail = 1; trail <= 5; trail++) {
        const tAngle = orbitAngle - trail * 0.08;
        const tx = orbitRx * Math.cos(tAngle);
        const ty = orbitRy * Math.sin(tAngle);
        ctx.beginPath();
        ctx.arc(tx, ty, Math.max(1, 2.2 - trail * 0.35), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 240, 255, ${0.75 - trail * 0.14})`;
        ctx.fill();
      }

      // Satellite Beacon Dot
      ctx.beginPath();
      ctx.arc(satX, satY, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 16;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Glowing Pulse Ring around Satellite
      const pulseRadius = 5 + (Math.sin(orbitAngle * 4) + 1) * 2.5;
      ctx.beginPath();
      ctx.arc(satX, satY, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.7)';
      ctx.lineWidth = 1.0;
      ctx.stroke();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div
      className={`relative flex items-center justify-center select-none overflow-visible ${className}`}
      style={{ width: 300, height: 220 }}
    >
      {/* Ambient Blue-Cyan Holographic Halo */}
      <div className="absolute w-52 h-52 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />
      <div className="absolute w-40 h-40 rounded-full bg-blue-600/30 blur-2xl pointer-events-none" />
      <canvas
        ref={canvasRef}
        width={300}
        height={220}
        className="relative z-10 drop-shadow-[0_0_24px_rgba(0,240,255,0.45)] pointer-events-none"
      />
    </div>
  );
};
