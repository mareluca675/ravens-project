// RAVENS custom brand mark: a stylized bird-in-flight above a river ripple,
// rendered on a rounded-square accent tile. Scales cleanly from 24 to 64 px.
import React from 'react';
import theme from '../theme';

export default function Logo({ size = 36, variant = 'default' }) {
  const uid = `ravens-logo-${variant}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-label="RAVENS"
      role="img"
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor={theme.color.accent} />
          <stop offset="100%" stopColor={theme.color.accentDim} />
        </linearGradient>
        <linearGradient id={`${uid}-bird`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.85" />
        </linearGradient>
      </defs>

      {/* Tile background */}
      <rect width="40" height="40" rx="9" fill={`url(#${uid}-bg)`} />

      {/* Subtle inner highlight for depth */}
      <rect x="1" y="1" width="38" height="38" rx="8" fill="none"
            stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

      {/* Stylized bird silhouette — outstretched wings + body diamond */}
      <path
        d="M 6 16 L 13 10 L 20 15 L 27 10 L 34 16 L 27 14.5 L 20 20 L 13 14.5 Z"
        fill={`url(#${uid}-bird)`}
      />

      {/* Small notch under body suggesting beak/tail silhouette */}
      <path
        d="M 18.5 20 L 20 22 L 21.5 20 Z"
        fill="#ffffff"
        opacity="0.95"
      />

      {/* Water ripples */}
      <path
        d="M 7 29 Q 10 27 13 29 T 19 29 T 25 29 T 31 29"
        stroke="#ffffff"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M 10 33 Q 13 31.5 16 33 T 22 33 T 28 33"
        stroke="#ffffff"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
