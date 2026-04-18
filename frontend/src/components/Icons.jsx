// Inline SVG icon set. 24×24 stroke-based, `currentColor` stroke.
// Keep each icon minimal — single path where possible, no fills unless noted.
import React from 'react';

const defaultProps = {
  size: 18,
  color: 'currentColor',
  strokeWidth: 1.8,
};

function Svg({ size, color, strokeWidth, children, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      {children}
    </svg>
  );
}

function iconComponent(render) {
  return function Icon(props = {}) {
    const p = { ...defaultProps, ...props };
    return <Svg {...p}>{render(p)}</Svg>;
  };
}

// --- Navigation icons ----------------------------------------------------

export const IconDashboard = iconComponent(() => (
  <>
    <rect x="3.5"  y="3.5"  width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5"  width="7" height="7" rx="1.5" />
    <rect x="3.5"  y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </>
));

export const IconMap = iconComponent(() => (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M 3 12 h 18" />
    <path d="M 12 3 a 14 14 0 0 1 0 18" />
    <path d="M 12 3 a 14 14 0 0 0 0 18" />
  </>
));

export const IconWaste = iconComponent(() => (
  <>
    <path d="M 4 7 h 16" />
    <path d="M 9 7 V 4 h 6 V 7" />
    <path d="M 6 7 l 1 13 a 1 1 0 0 0 1 1 h 8 a 1 1 0 0 0 1 -1 l 1 -13" />
    <path d="M 10 11 v 6" />
    <path d="M 14 11 v 6" />
  </>
));

export const IconLidar = iconComponent(({ color }) => (
  <>
    <polygon points="12,3 20.5,7.5 20.5,16.5 12,21 3.5,16.5 3.5,7.5" />
    <circle cx="12" cy="12" r="1.2" fill={color} stroke="none" />
    <circle cx="8.2"  cy="9.2"  r="0.9" fill={color} stroke="none" />
    <circle cx="15.8" cy="9.2"  r="0.9" fill={color} stroke="none" />
    <circle cx="9.2"  cy="15"   r="0.9" fill={color} stroke="none" />
    <circle cx="14.8" cy="15"   r="0.9" fill={color} stroke="none" />
  </>
));

export const IconAlert = iconComponent(({ color }) => (
  <>
    <path d="M 12 3 L 22 20 H 2 Z" />
    <path d="M 12 10 v 4" />
    <circle cx="12" cy="17.2" r="0.6" fill={color} stroke="none" />
  </>
));

export const IconTrend = iconComponent(() => (
  <>
    <path d="M 3 17 L 9 11 L 13 15 L 21 7" />
    <path d="M 15 7 h 6 v 6" />
  </>
));

export const IconCamera = iconComponent(() => (
  <>
    <path d="M 3 8 a 1 1 0 0 1 1 -1 h 4 l 2 -3 h 4 l 2 3 h 4 a 1 1 0 0 1 1 1 v 10 a 1 1 0 0 1 -1 1 h -16 a 1 1 0 0 1 -1 -1 z" />
    <circle cx="12" cy="13" r="4" />
  </>
));

export const IconWater = iconComponent(() => (
  <path d="M 12 3 C 8 9 6 12 6 15 a 6 6 0 0 0 12 0 C 18 12 16 9 12 3 Z" />
));

export const IconChat = iconComponent(({ color }) => (
  <>
    <path d="M 4 5 h 16 a 1 1 0 0 1 1 1 v 10 a 1 1 0 0 1 -1 1 H 11 l -4 4 v -4 H 4 a 1 1 0 0 1 -1 -1 V 6 a 1 1 0 0 1 1 -1 z" />
    <circle cx="8"  cy="11" r="0.9" fill={color} stroke="none" />
    <circle cx="12" cy="11" r="0.9" fill={color} stroke="none" />
    <circle cx="16" cy="11" r="0.9" fill={color} stroke="none" />
  </>
));

// --- Action / state icons ------------------------------------------------

export const IconPlay = iconComponent(({ color }) => (
  <path d="M 7 4.5 V 19.5 L 20 12 Z" fill={color} stroke={color} strokeLinejoin="round" />
));

export const IconCheck = iconComponent(() => (
  <path d="M 4 12 L 10 18 L 20 6" strokeWidth="2.2" />
));

export const IconDownload = iconComponent(() => (
  <>
    <path d="M 12 4 v 12" />
    <path d="M 6 10 L 12 16 L 18 10" />
    <path d="M 4 20 h 16" />
  </>
));

export const IconUpload = iconComponent(() => (
  <>
    <path d="M 4 15 v 4 a 1 1 0 0 0 1 1 h 14 a 1 1 0 0 0 1 -1 v -4" />
    <path d="M 12 3 v 13" />
    <path d="M 6 9 L 12 3 L 18 9" />
  </>
));

export const IconPin = iconComponent(() => (
  <>
    <path d="M 12 21 c -5 -7 -7 -10 -7 -13 a 7 7 0 0 1 14 0 c 0 3 -2 6 -7 13 z" />
    <circle cx="12" cy="8.5" r="2.5" />
  </>
));

export const IconBan = iconComponent(() => (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M 5.6 5.6 L 18.4 18.4" />
  </>
));

export const IconArrowLeft = iconComponent(() => (
  <>
    <path d="M 4 12 h 16" />
    <path d="M 10 6 L 4 12 L 10 18" />
  </>
));

export const IconArrowRight = iconComponent(() => (
  <>
    <path d="M 4 12 h 16" />
    <path d="M 14 6 L 20 12 L 14 18" />
  </>
));

export const IconX = iconComponent(() => (
  <>
    <path d="M 5 5 L 19 19" />
    <path d="M 19 5 L 5 19" />
  </>
));

export const IconPause = iconComponent(({ color }) => (
  <>
    <rect x="6"  y="4.5" width="4" height="15" rx="1" fill={color} stroke="none" />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill={color} stroke="none" />
  </>
));

export const IconClock = iconComponent(() => (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M 12 7 V 12 L 15.5 14.2" />
  </>
));

export const IconRefresh = iconComponent(() => (
  <>
    <path d="M 4 12 a 8 8 0 0 1 13.5 -5.7 L 20 9" />
    <path d="M 20 4 v 5 h -5" />
    <path d="M 20 12 a 8 8 0 0 1 -13.5 5.7 L 4 15" />
    <path d="M 4 20 v -5 h 5" />
  </>
));

export const IconFile = iconComponent(() => (
  <>
    <path d="M 7 3 h 8 l 4 4 v 13 a 1 1 0 0 1 -1 1 H 7 a 1 1 0 0 1 -1 -1 V 4 a 1 1 0 0 1 1 -1 z" />
    <path d="M 15 3 v 4 h 4" />
    <path d="M 9 12 h 8" />
    <path d="M 9 16 h 6" />
  </>
));

// --- Stage icons for the LiDAR pipeline (each represents an algorithm) ----

export const IconStageRaw = iconComponent(({ color }) => (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.5" fill={color} stroke="none" />
  </>
));

export const IconStageFilter = iconComponent(() => (
  <>
    <path d="M 12 3 L 20 12 L 12 21 L 4 12 Z" />
    <path d="M 8 12 h 8" />
  </>
));

export const IconStagePlane = iconComponent(() => (
  <>
    <path d="M 4 16 L 12 6 L 20 16 Z" />
    <path d="M 3 20 h 18" />
  </>
));

export const IconStageCluster = iconComponent(() => (
  <polygon points="12,3 20.5,8 20.5,16 12,21 3.5,16 3.5,8" />
));

export const IconStageClassify = iconComponent(() => (
  <path d="M 12 3 L 14.2 9.5 L 21 9.8 L 15.5 14 L 17.5 20.5 L 12 16.6 L 6.5 20.5 L 8.5 14 L 3 9.8 L 9.8 9.5 Z" />
));
