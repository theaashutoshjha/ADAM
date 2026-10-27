import React, { useRef, useState } from 'react';

interface TiltCardProps {
  children: React.ReactNode;
  maxTilt?: number;
  tiltStrength?: number;
  scale?: number;
  className?: string;
  glowColor?: string;
}

export const TiltCard: React.FC<TiltCardProps> = ({
  children,
  maxTilt = 7,
  tiltStrength,
  scale = 1.015,
  className = '',
  glowColor = 'rgba(0, 240, 255, 0.15)',
}) => {
  const effectiveMaxTilt = tiltStrength !== undefined ? tiltStrength : maxTilt;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [shineStyle, setShineStyle] = useState<React.CSSProperties>({ opacity: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -effectiveMaxTilt;
    const rotateY = ((x - centerX) / centerX) * effectiveMaxTilt;

    setStyle({
      transform: `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(${scale}, ${scale}, ${scale})`,
      transition: 'transform 0.08s ease-out',
      boxShadow: `0 20px 40px -15px rgba(0, 0, 0, 0.7), 0 0 25px ${glowColor}`,
    });

    setShineStyle({
      opacity: 1,
      background: `radial-gradient(circle 220px at ${x}px ${y}px, rgba(255, 255, 255, 0.12), transparent 70%)`,
      transition: 'opacity 0.2s ease',
    });
  };

  const handleMouseLeave = () => {
    setStyle({
      transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)',
      transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.4s ease',
      boxShadow: 'none',
    });
    setShineStyle({
      opacity: 0,
      transition: 'opacity 0.4s ease',
    });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative transform-gpu will-change-transform rounded-2xl ${className}`}
      style={{ transformStyle: 'preserve-3d', ...style }}
    >
      {/* Specular Light Shine Reflection Overlay */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none z-10"
        style={shineStyle}
      />
      {children}
    </div>
  );
};
