import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  IconPlay, IconPause, IconCheck, IconDownload, IconUpload,
  IconFile, IconX, IconArrowLeft, IconArrowRight, IconClock,
  IconRefresh, IconAlert,
  IconStageRaw, IconStageFilter, IconStagePlane, IconStageCluster, IconStageClassify,
} from './Icons';

// ─── Deterministic PRNG ───────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Cluster definitions (shared across all 5 stages) ────────────────────
// Logical coordinate space: 720 × 420.
const CLUSTERS = [
  { id: 1, cx: 180, cy: 220, shape: 'ellipse',   rx: 45, ry: 20, nPoints: 847, category: 'Plastic',            confidence: 0.91 },
  { id: 2, cx: 340, cy: 160, shape: 'circle',    rx: 25, ry: 25, nPoints: 312, category: 'Metal',              confidence: 0.94 },
  { id: 3, cx: 480, cy: 240, shape: 'irregular', rx: 35, ry: 30, nPoints: 634, category: 'Organic',            confidence: 0.81 },
  { id: 4, cx: 260, cy: 320, shape: 'rect',      rx: 50, ry: 18, nPoints: 423, category: 'Construcții',        confidence: 0.89 },
  { id: 5, cx: 420, cy: 340, shape: 'spread',    rx: 40, ry: 35, nPoints: 198, category: 'Substanță lichidă',  confidence: 0.76 },
  { id: 6, cx: 560, cy: 180, shape: 'ellipse',   rx: 30, ry: 22, nPoints: 521, category: 'Plastic',            confidence: 0.88 },
];

const DBSCAN_COLORS = {
  1: '#FF6B6B',
  2: '#4ECDC4',
  3: '#45B7D1',
  4: '#96CEB4',
  5: '#FFEAA7',
  6: '#DDA0DD',
};

const CATEGORY_COLORS = {
  'Plastic':              '#4A90D9',
  'Metal':                '#9B9B9B',
  'Organic':              '#7ED321',
  'Construcții':          '#F5A623',
  'Substanță lichidă':    '#D0021B',
};

// Map backend (English, lowercase) → display labels used in CATEGORY_COLORS
const REAL_CATEGORY_LABELS = {
  plastic:      'Plastic',
  metal:        'Metal',
  organic:      'Organic',
  construction: 'Construcții',
  liquid:       'Substanță lichidă',
  background:   'Fundal',
};
const displayCategory = (c) => REAL_CATEGORY_LABELS[c] || c || 'Necunoscut';

const CANVAS_W = 720;
const CANVAS_H = 420;

// ─── Stage definitions ────────────────────────────────────────────────────
const STAGES = [
  {
    key: 'raw',
    num: '01',
    Icon: IconStageRaw,
    title: 'Nor Brut de Puncte',
    subtitle: 'Raw LiDAR Point Cloud',
    desc:
      'Norul brut de puncte LiDAR — milioane de puncte XYZ achiziționate în format LAS/LAZ. Culoarea codifică înălțimea Z. Conține sol, obiecte și puncte aberante (zgomot).',
    caption: 'Nor brut: ~1.200.000 puncte · Zgomot: ~8% · Format: LAS/LAZ',
    processingTime: null,
    formula: null,
    stats: [
      { label: 'Total puncte', value: '1.200.000' },
      { label: 'Zgomot estimat', value: '~8%' },
      { label: 'Format', value: 'LAS/LAZ v1.4' },
      { label: 'Altitudine senzor', value: '85 m AGL' },
    ],
  },
  {
    key: 'sor',
    num: '02',
    Icon: IconStageFilter,
    title: 'După SOR',
    subtitle: 'Statistical Outlier Removal',
    desc:
      'Algoritmul SOR calculează distanța medie față de cei k=20 vecini pentru fiecare punct. Punctele cu distanță > μ + 2σ sunt eliminate ca zgomot.',
    caption: 'k=20 vecini · prag=2.0σ · Timp procesare: 0.8 s',
    processingTime: 0.8,
    formula: 'outlier if d_i > μ_k + 2.0 · σ_k',
    stats: [
      { label: 'Puncte eliminate', value: '94.000 (7.8%)' },
      { label: 'k (vecini)', value: '20' },
      { label: 'Prag σ', value: '2.0' },
      { label: 'Timp execuție', value: '0.8 s' },
    ],
  },
  {
    key: 'ransac',
    num: '03',
    Icon: IconStagePlane,
    title: 'După RANSAC',
    subtitle: 'Ground Plane Removal',
    desc:
      'RANSAC ajustează un plan prin eșantionare aleatorie (3 puncte, 1000 iterații). Punctele de pe sol sunt separate, rămân doar obiectele de deasupra.',
    caption: '1000 iterații RANSAC · prag=0,15 m · Sol eliminat: 68% din puncte',
    processingTime: 1.2,
    formula: 'z = 0.82x + 0.03y + 1.14',
    stats: [
      { label: 'Sol eliminat', value: '68%' },
      { label: 'Iterații', value: '1.000' },
      { label: 'Toleranță', value: '±0,15 m' },
      { label: 'Timp execuție', value: '1.2 s' },
    ],
  },
  {
    key: 'dbscan',
    num: '04',
    Icon: IconStageCluster,
    title: 'După DBSCAN',
    subtitle: 'Density-Based Spatial Clustering',
    desc:
      'DBSCAN grupează punctele în clustere pe baza densității locale (eps=0,5 m, minPts=10), fără număr predefinit de clustere. Forme arbitrare detectate.',
    caption: '6 clustere detectate · eps=0,5 m · minPts=10 · Zgomot: 3.2%',
    processingTime: 1.4,
    formula: '|N_ε(p)| ≥ minPts',
    stats: [
      { label: 'Clustere detectate', value: '6' },
      { label: 'Zgomot DBSCAN', value: '3.2%' },
      { label: 'ε (rază)', value: '0,5 m' },
      { label: 'minPts', value: '10' },
    ],
  },
  {
    key: 'classify',
    num: '05',
    Icon: IconStageClassify,
    title: 'Obiecte Clasificate',
    subtitle: 'PCA + CNN Classification',
    desc:
      'CNN clasifică fiecare cluster folosind caracteristici PCA (sfericitate, planaritate, OBB volum) + fuziune cu camera RGB. Precizie medie F1: 87%.',
    caption: 'CNN + fuziune optică · F1 mediu: 87% · +14 pp față de LiDAR solo · 18 obiecte · Volum estimat: 2.4 m³',
    processingTime: 0.8,
    formula: 'F1 = 2 · P · R / (P + R)  →  0,87',
    stats: [
      { label: 'F1 mediu', value: '87%' },
      { label: 'Câștig fuziune', value: '+14 pp' },
      { label: 'Obiecte totale', value: '18' },
      { label: 'Volum estimat', value: '2.4 m³' },
    ],
  },
];

const TOTAL_PIPELINE_TIME = STAGES.reduce((acc, s) => acc + (s.processingTime || 0), 0); // 4.2s

// ─── Z-height → color gradient (blue → green → yellow → red) ─────────────
function zToColor(z, zMax = 2.5) {
  const t = Math.max(0, Math.min(1, z / zMax));
  const stops = [
    [0.0,  [60, 100, 220]],
    [0.33, [40, 200, 120]],
    [0.66, [240, 200, 50]],
    [1.0,  [230, 60, 50]],
  ];
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0);
      return `rgb(${Math.round(c0[0] + (c1[0] - c0[0]) * f)},${Math.round(c0[1] + (c1[1] - c0[1]) * f)},${Math.round(c0[2] + (c1[2] - c0[2]) * f)})`;
    }
  }
  return 'rgb(230,60,50)';
}

// ─── Cluster shape sampler ────────────────────────────────────────────────
function shapeOffset(shape, rx, ry, rng) {
  switch (shape) {
    case 'circle':
    case 'ellipse': {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng());
      return [Math.cos(a) * r * rx, Math.sin(a) * r * ry];
    }
    case 'rect':
      return [(rng() - 0.5) * rx * 2, (rng() - 0.5) * ry * 2];
    case 'irregular': {
      const ang = rng() * Math.PI * 2;
      const rad =
        (0.45 + rng() * 0.55) *
        Math.max(rx, ry) *
        (0.65 + 0.25 * Math.sin(ang * 3) + 0.15 * Math.cos(ang * 5));
      return [Math.cos(ang) * rad, Math.sin(ang) * rad * 0.7];
    }
    case 'spread': {
      const a = rng() * Math.PI * 2;
      const r = Math.pow(rng(), 0.45); // bias toward edges
      return [Math.cos(a) * r * rx, Math.sin(a) * r * ry];
    }
    default:
      return [0, 0];
  }
}

// ─── Point cloud generation (deterministic) ───────────────────────────────
function generatePointCloud() {
  const rng = mulberry32(42);
  const pts = [];

  // Ground plane — slightly tilted (simulates a riverbank slope)
  for (let i = 0; i < 1200; i++) {
    const x = rng() * CANVAS_W;
    const y = rng() * CANVAS_H;
    const z = 0.05 + rng() * 0.2 + (y / CANVAS_H) * 0.15;
    pts.push({ x, y, z, type: 'ground' });
  }

  // Waste clusters
  for (const c of CLUSTERS) {
    const nRender = Math.round(c.nPoints * 0.5); // render half for perf
    for (let i = 0; i < nRender; i++) {
      const [dx, dy] = shapeOffset(c.shape, c.rx, c.ry, rng);
      const distNorm = Math.min(1, Math.sqrt((dx / c.rx) ** 2 + (dy / c.ry) ** 2));
      const z = 0.55 + (1 - distNorm) * 1.75 + rng() * 0.25; // peak at center, taper toward edges
      pts.push({ x: c.cx + dx, y: c.cy + dy, z, type: 'cluster', clusterId: c.id });
    }
  }

  // Noise / outliers — abnormally high Z, scattered positions
  for (let i = 0; i < 150; i++) {
    pts.push({
      x: rng() * CANVAS_W,
      y: rng() * CANVAS_H,
      z: 3 + rng() * 7,
      type: 'noise',
    });
  }

  return pts;
}

// Oriented bounding box for a cluster (axis-aligned around center + padding)
function clusterOBB(c) {
  const pad = 8;
  return { x0: c.cx - c.rx - pad, y0: c.cy - c.ry - pad, x1: c.cx + c.rx + pad, y1: c.cy + c.ry + pad };
}

// ─── Stage renderer ───────────────────────────────────────────────────────
function renderStage(canvas, stageKey, points) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Background
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = 'rgba(80, 100, 140, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const x = (i / 10) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let i = 1; i < 6; i++) {
    const y = (i / 6) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Logical → pixel scaling
  const sx = (x) => (x / CANVAS_W) * w;
  const sy = (y) => (y / CANVAS_H) * h;

  // Draw points — stage-specific logic
  for (const p of points) {
    let fill = null;
    let radius = 1.4;
    let alpha = 1;

    if (p.type === 'ground') {
      if (stageKey === 'raw' || stageKey === 'sor') {
        fill = zToColor(p.z);
        radius = 1.15;
      } else if (stageKey === 'ransac') {
        fill = 'rgb(90, 100, 120)';
        alpha = 0.2;
        radius = 1.0;
      } else {
        continue;
      }
    } else if (p.type === 'noise') {
      if (stageKey === 'raw') {
        fill = '#ff33dd';
        radius = 1.9;
      } else {
        continue;
      }
    } else if (p.type === 'cluster') {
      if (stageKey === 'raw' || stageKey === 'sor' || stageKey === 'ransac') {
        fill = zToColor(p.z);
        radius = 1.5;
      } else if (stageKey === 'dbscan') {
        fill = DBSCAN_COLORS[p.clusterId];
        radius = 1.8;
      } else if (stageKey === 'classify') {
        const c = CLUSTERS.find((cc) => cc.id === p.clusterId);
        fill = CATEGORY_COLORS[c.category];
        radius = 1.8;
      }
    }

    if (!fill) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(sx(p.x), sy(p.y), radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Stage overlays:
  if (stageKey === 'raw' || stageKey === 'sor' || stageKey === 'ransac') {
    drawHeightLegend(ctx, w - 66, 28, 18, Math.min(220, h - 80));
  }

  if (stageKey === 'sor') {
    drawBadge(ctx, 16, 16, '↓ 94.000 puncte eliminate (7.8%)', '#e74c3c');
  }

  if (stageKey === 'ransac') {
    // Dashed plane line + equation label
    const planeY = sy(CANVAS_H * 0.75);
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(0, planeY);
    ctx.lineTo(w, planeY);
    ctx.stroke();
    ctx.setLineDash([]);
    // Label box
    const labelText = 'Plan teren:  z = 0.82x + 0.03y + 1.14';
    ctx.font = '500 11px "JetBrains Mono","Consolas",monospace';
    const m = ctx.measureText(labelText);
    const boxW = m.width + 20;
    const boxX = 14;
    const boxY = planeY - 32;
    ctx.fillStyle = 'rgba(10,10,26,0.9)';
    ctx.fillRect(boxX, boxY, boxW, 22);
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, boxW, 22);
    ctx.fillStyle = '#f39c12';
    ctx.fillText(labelText, boxX + 10, boxY + 15);
  }

  if (stageKey === 'dbscan') {
    // Per-cluster label
    ctx.font = '600 10px system-ui,-apple-system,sans-serif';
    for (const c of CLUSTERS) {
      const cx = sx(c.cx);
      const cy = sy(c.cy - c.ry - 12);
      const label = `C${c.id} (${c.nPoints} pct)`;
      const m = ctx.measureText(label);
      const boxW = m.width + 12, boxH = 16;
      const boxX = cx - boxW / 2, boxY = cy - 11;
      ctx.fillStyle = 'rgba(10,10,26,0.92)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = DBSCAN_COLORS[c.id];
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = DBSCAN_COLORS[c.id];
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, cy + 1);
    }
    ctx.textAlign = 'start';
  }

  if (stageKey === 'classify') {
    // White dashed OBB around each cluster + category label
    ctx.font = '700 10px system-ui,-apple-system,sans-serif';
    for (const c of CLUSTERS) {
      const obb = clusterOBB(c);
      const x0 = sx(obb.x0), y0 = sy(obb.y0);
      const x1 = sx(obb.x1), y1 = sy(obb.y1);
      // OBB
      ctx.strokeStyle = 'rgba(255,255,255,0.78)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
      ctx.setLineDash([]);
      // Category label
      const label = `${c.category} · ${Math.round(c.confidence * 100)}%`;
      const m = ctx.measureText(label);
      const boxW = m.width + 14, boxH = 17;
      const boxX = x0;
      const boxY = y0 - boxH - 4;
      const color = CATEGORY_COLORS[c.category];
      ctx.fillStyle = color;
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = '#0a0a1a';
      ctx.fillText(label, boxX + 7, boxY + 12);
    }
    // Category legend (top-right corner)
    drawCategoryLegend(ctx, w - 186, 14);
  }

  // Axis labels
  ctx.fillStyle = '#4a5468';
  ctx.font = '10px system-ui,-apple-system,sans-serif';
  ctx.fillText('x →', w - 26, h - 8);
  ctx.fillText('y ↑', 8, 16);
  ctx.fillText('200 m × 120 m', w / 2 - 40, h - 8);
}

// ─── Canvas overlay helpers ───────────────────────────────────────────────
function drawHeightLegend(ctx, x, y, w, h) {
  // vertical gradient bar (top=red=high, bottom=blue=low)
  const grad = ctx.createLinearGradient(0, y + h, 0, y);
  grad.addColorStop(0.0,  'rgb(60,100,220)');
  grad.addColorStop(0.33, 'rgb(40,200,120)');
  grad.addColorStop(0.66, 'rgb(240,200,50)');
  grad.addColorStop(1.0,  'rgb(230,60,50)');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  // Tick labels
  const ticks = [
    ['0.0', 0.0],
    ['1.0', 0.4],
    ['2.0', 0.8],
    ['2.5+', 1.0],
  ];
  ctx.fillStyle = '#8892a4';
  ctx.font = '9px system-ui,-apple-system,sans-serif';
  for (const [lbl, t] of ticks) {
    const ty = y + h - t * h;
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.moveTo(x + w, ty);
    ctx.lineTo(x + w + 4, ty);
    ctx.stroke();
    ctx.fillText(lbl, x + w + 6, ty + 3);
  }
  // Rotated title
  ctx.save();
  ctx.translate(x - 6, y + h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = '#b5bdcc';
  ctx.font = '600 10px system-ui,-apple-system,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Înălțime (m)', 0, 0);
  ctx.restore();
}

function drawBadge(ctx, x, y, text, color) {
  ctx.font = '600 11px system-ui,-apple-system,sans-serif';
  const m = ctx.measureText(text);
  const pad = 10, boxW = m.width + pad * 2, boxH = 22;
  ctx.fillStyle = 'rgba(10,10,26,0.92)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, boxW, boxH);
  ctx.fillStyle = color;
  ctx.fillText(text, x + pad, y + 15);
}

function drawCategoryLegend(ctx, x, y) {
  const items = Object.entries(CATEGORY_COLORS);
  const pad = 8, rowH = 16, titleH = 14;
  const w = 172;
  const h = titleH + pad * 2 + items.length * rowH;
  ctx.fillStyle = 'rgba(10,10,26,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  // Title
  ctx.fillStyle = '#8892a4';
  ctx.font = '700 9px system-ui,-apple-system,sans-serif';
  ctx.fillText('CATEGORII', x + pad, y + pad + 5);
  // Rows
  ctx.font = '500 10px system-ui,-apple-system,sans-serif';
  items.forEach(([cat, col], i) => {
    const rowY = y + pad + titleH + i * rowH;
    ctx.fillStyle = col;
    ctx.fillRect(x + pad, rowY + 3, 10, 10);
    ctx.fillStyle = '#e0e0e0';
    ctx.fillText(cat, x + pad + 18, rowY + 12);
  });
}

// ─── Real upload helpers ─────────────────────────────────────────────────
const API_BASE =
  (typeof process !== 'undefined' && process.env && process.env.REACT_APP_API_URL) ||
  'http://localhost:8000';
const ALLOWED_EXT = ['las', 'laz', 'xyz', 'csv', 'txt'];
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

// Post-upload stage timings (simulated so the jury can watch the pipeline run)
const REAL_STAGES = [
  { key: 'upload', label: 'Încărcare' },
  { key: 'sor',    label: 'SOR',    ms: 1500 },
  { key: 'ransac', label: 'RANSAC', ms: 2000 },
  { key: 'dbscan', label: 'DBSCAN', ms: 2200 },
  { key: 'cnn',    label: 'CNN',    ms: 1500 },
];

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function validateFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return `Format neacceptat: .${ext}. Folosește .las, .laz, .xyz, .csv sau .txt`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `Fișierul depășește limita de 50 MB (${formatBytes(file.size)})`;
  }
  // For text formats, sniff the first few lines for 3 numeric columns
  if (['xyz', 'csv', 'txt'].includes(ext)) {
    const head = await file.slice(0, 4096).text();
    const lines = head.split(/\r?\n/).filter((l) => l.trim()).slice(0, 5);
    const hasNumeric = lines.some((line) => {
      const tok = line.replace(/,/g, ' ').split(/\s+/).filter(Boolean);
      if (tok.length < 3) return false;
      return tok.slice(0, 3).every((t) => Number.isFinite(parseFloat(t)) && /^-?\d/.test(t));
    });
    if (!hasNumeric) {
      return 'Conținut invalid — nu s-au găsit coloane X Y Z numerice';
    }
  }
  return null;
}

// Draw the backend-returned clusters on a canvas in the same style as the demo
function renderRealResults(canvas, clusters, totalPoints) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = 'rgba(80, 100, 140, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const x = (i / 10) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let i = 1; i < 6; i++) {
    const y = (i / 6) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  if (!clusters || clusters.length === 0) {
    ctx.fillStyle = '#8892a4';
    ctx.font = '500 14px system-ui,-apple-system,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Niciun cluster detectat în acest nor de puncte', w / 2, h / 2);
    ctx.textAlign = 'start';
    return;
  }

  // Fit all centroids into the canvas
  const xs = clusters.map((c) => c.centroid_x);
  const ys = clusters.map((c) => c.centroid_y);
  const minX = Math.min(...xs) - 10, maxX = Math.max(...xs) + 10;
  const minY = Math.min(...ys) - 10, maxY = Math.max(...ys) + 10;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const pad = 44;
  const sx = (x) => pad + ((x - minX) / spanX) * (w - pad * 2);
  const sy = (y) => h - pad - ((y - minY) / spanY) * (h - pad * 2);

  const colorFor = (cat) => CATEGORY_COLORS[displayCategory(cat)] || '#DDA0DD';
  const rng = mulberry32(17);

  // Point halo around each centroid, sized by n_points/volume
  for (const c of clusters) {
    const col = colorFor(c.category);
    const n = Math.min(500, Math.max(60, c.n_points || 80));
    const radius = Math.max(12, Math.min(48, Math.sqrt(Math.max(0.1, c.volume || 0.3) * 160)));
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * radius;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(sx(c.centroid_x) + Math.cos(a) * r, sy(c.centroid_y) + Math.sin(a) * r, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // OBB + category label per cluster
  ctx.font = '700 10px system-ui,-apple-system,sans-serif';
  for (const c of clusters) {
    const col = colorFor(c.category);
    const r = Math.max(16, Math.min(58, Math.sqrt(Math.max(0.1, c.volume || 0.3) * 220)));
    const cx = sx(c.centroid_x);
    const cy = sy(c.centroid_y);
    ctx.strokeStyle = 'rgba(255,255,255,0.78)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(cx - r, cy - r * 0.7, r * 2, r * 1.4);
    ctx.setLineDash([]);
    const label = `${displayCategory(c.category)} · ${Math.round((c.confidence || 0) * 100)}%`;
    const m = ctx.measureText(label);
    const boxW = m.width + 14, boxH = 17;
    ctx.fillStyle = col;
    ctx.fillRect(cx - r, cy - r * 0.7 - boxH - 4, boxW, boxH);
    ctx.fillStyle = '#0a0a1a';
    ctx.fillText(label, cx - r + 7, cy - r * 0.7 - 4 - 5);
  }

  drawCategoryLegend(ctx, w - 186, 14);

  ctx.fillStyle = '#4a5468';
  ctx.font = '10px system-ui,-apple-system,sans-serif';
  ctx.fillText('x →', w - 26, h - 8);
  ctx.fillText('y ↑', 8, 16);
  ctx.fillText(
    `${clusters.length} clustere · ${(totalPoints || 0).toLocaleString('ro-RO')} puncte`,
    w / 2 - 90, h - 8,
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export default function LidarPipeline() {
  const [activeStage, setActiveStage] = useState('raw');
  const [autoPlay, setAutoPlay] = useState(false);

  const points = useMemo(generatePointCloud, []);
  const stage = STAGES.find((s) => s.key === activeStage);
  const activeIdx = STAGES.findIndex((s) => s.key === activeStage);
  const isFinalStage = activeIdx === STAGES.length - 1;

  const canvasRef = useRef(null);
  const boxRef = useRef(null);

  // Cumulative time up to and including the current stage
  const elapsed = STAGES
    .slice(0, activeIdx + 1)
    .reduce((acc, s) => acc + (s.processingTime || 0), 0);

  // Render the canvas whenever the stage or the window size changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    renderStage(canvas, activeStage, points);
    const handler = () => renderStage(canvas, activeStage, points);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [activeStage, points]);

  // Autoplay at 1.5 s per stage; stops at the final stage
  useEffect(() => {
    if (!autoPlay) return undefined;
    if (activeIdx >= STAGES.length - 1) {
      const stopTimer = setTimeout(() => setAutoPlay(false), 1500);
      return () => clearTimeout(stopTimer);
    }
    const nextKey = STAGES[activeIdx + 1].key;
    const timer = setTimeout(() => setActiveStage(nextKey), 1500);
    return () => clearTimeout(timer);
  }, [autoPlay, activeIdx]);

  const goPrev = () => {
    setAutoPlay(false);
    if (activeIdx > 0) setActiveStage(STAGES[activeIdx - 1].key);
  };
  const goNext = () => {
    setAutoPlay(false);
    if (activeIdx < STAGES.length - 1) setActiveStage(STAGES[activeIdx + 1].key);
  };
  const runFullPipeline = () => {
    setActiveStage('raw');
    setAutoPlay(true);
  };

  // ─── Real data upload state ─────────────────────────────────────────────
  const [uploadState, setUploadState] = useState('idle'); // idle|ready|processing|complete|error
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [progress, setProgress] = useState({ stageIdx: 0, stagePercent: 0 });
  const [resultData, setResultData] = useState(null);
  const [processingError, setProcessingError] = useState(null);
  const resultCanvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Render real results on canvas once they arrive
  useEffect(() => {
    if (uploadState !== 'complete' || !resultData) return undefined;
    const canvas = resultCanvasRef.current;
    if (!canvas) return undefined;
    renderRealResults(canvas, resultData.clusters, resultData.total_points);
    const handler = () => renderRealResults(canvas, resultData.clusters, resultData.total_points);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [uploadState, resultData]);

  const handlePickFile = async (file) => {
    setProcessingError(null);
    const err = await validateFile(file);
    if (err) {
      setFileError(err);
      setSelectedFile(null);
      setUploadState('idle');
      return;
    }
    setFileError(null);
    setSelectedFile(file);
    setUploadState('ready');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handlePickFile(file);
  };

  const handleClear = () => {
    setSelectedFile(null);
    setFileError(null);
    setProcessingError(null);
    setResultData(null);
    setProgress({ stageIdx: 0, stagePercent: 0 });
    setUploadState('idle');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const animateStages = (data) => {
    // Stages 1-4: SOR, RANSAC, DBSCAN, CNN (upload is stage 0, already done).
    // setTimeout-based ticking so animation keeps running even when the tab is
    // not in focus (rAF is aggressively throttled in background tabs).
    const postUpload = REAL_STAGES.slice(1);
    const TICK_MS = 60;
    const runStage = (i) => {
      if (i >= postUpload.length) {
        setProgress({ stageIdx: REAL_STAGES.length - 1, stagePercent: 100 });
        setResultData(data);
        setUploadState('complete');
        return;
      }
      const { ms } = postUpload[i];
      const start = Date.now();
      const tick = () => {
        const p = Math.min(100, ((Date.now() - start) / ms) * 100);
        setProgress({ stageIdx: i + 1, stagePercent: p });
        if (p < 100) {
          setTimeout(tick, TICK_MS);
        } else {
          runStage(i + 1);
        }
      };
      setTimeout(tick, TICK_MS);
    };
    runStage(0);
  };

  const runRealPipeline = () => {
    if (!selectedFile) return;
    setUploadState('processing');
    setProgress({ stageIdx: 0, stagePercent: 0 });
    setProcessingError(null);

    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', selectedFile);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setProgress({ stageIdx: 0, stagePercent: (evt.loaded / evt.total) * 100 });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          setProgress({ stageIdx: 0, stagePercent: 100 });
          animateStages(data);
        } catch {
          setProcessingError('Răspuns invalid de la server.');
          setUploadState('error');
        }
      } else {
        let msg = `Eroare server (${xhr.status})`;
        try {
          const j = JSON.parse(xhr.responseText);
          if (j.detail) msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail);
        } catch { /* ignore */ }
        setProcessingError(msg);
        setUploadState('error');
      }
    };

    xhr.onerror = () => {
      setProcessingError('Backend indisponibil — pornește serverul pe portul 8000');
      setUploadState('error');
    };

    xhr.open('POST', `${API_BASE}/api/lidar/process`);
    xhr.send(formData);
  };

  const downloadResultJSON = () => {
    if (!resultData) return;
    const blob = new Blob([JSON.stringify(resultData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ravens_lidar_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Category breakdown for the summary table (keyed by display label)
  const categoryBreakdown = useMemo(() => {
    if (!resultData?.clusters) return [];
    const counts = {};
    for (const c of resultData.clusters) {
      const k = displayCategory(c.category);
      if (!counts[k]) counts[k] = { count: 0, volume: 0 };
      counts[k].count += 1;
      counts[k].volume += c.volume || 0;
    }
    return Object.entries(counts).map(([k, v]) => ({ category: k, ...v }));
  }, [resultData]);

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Pipeline de Procesare LiDAR</h2>
          <p style={styles.subtitle}>
            Explorați cele 5 etape algoritmice care transformă un nor brut de puncte 3D în deșeuri clasificate și
            localizate geografic
          </p>
        </div>
        <button
          onClick={autoPlay ? () => setAutoPlay(false) : runFullPipeline}
          style={autoPlay ? { ...styles.playBtn, ...styles.playBtnActive } : styles.playBtn}
          title={autoPlay ? 'Oprește prezentarea automată' : 'Pornește pipeline-ul complet (1,5 s / etapă)'}
        >
          <span style={styles.playIcon}>
            {autoPlay ? <IconPause size={14} /> : <IconPlay size={14} />}
          </span>
          {autoPlay ? 'Oprește' : 'Rulează pipeline complet'}
        </button>
      </div>

      {/* Pipeline bar */}
      <div style={styles.pipelineBar}>
        {STAGES.map((s, i) => {
          const active = s.key === activeStage;
          const completed = i < activeIdx;
          return (
            <React.Fragment key={s.key}>
              <button
                onClick={() => {
                  setAutoPlay(false);
                  setActiveStage(s.key);
                }}
                style={
                  active
                    ? { ...styles.stageCard, ...styles.stageCardActive }
                    : completed
                    ? { ...styles.stageCard, ...styles.stageCardDone }
                    : styles.stageCard
                }
              >
                <div
                  style={
                    active
                      ? { ...styles.stageNum, ...styles.stageNumActive }
                      : completed
                      ? { ...styles.stageNum, ...styles.stageNumDone }
                      : styles.stageNum
                  }
                >
                  {s.num}
                </div>
                <div style={styles.stageIcon}>
                  <s.Icon size={22} color={active ? '#e94560' : completed ? '#27ae60' : '#8892a4'} />
                </div>
                <div style={styles.stageTitle}>{s.title}</div>
                <div style={styles.stageSub}>{s.subtitle}</div>
              </button>
              {i < STAGES.length - 1 && (
                <div style={completed ? { ...styles.arrow, ...styles.arrowDone } : styles.arrow}>
                  <IconArrowRight size={18} color={completed ? '#27ae60' : '#2a3040'} strokeWidth={1.6} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Prev/Next controls */}
      <div style={styles.navControls}>
        <button
          onClick={goPrev}
          disabled={activeIdx === 0}
          style={activeIdx === 0 ? { ...styles.navBtn, ...styles.navBtnDisabled } : styles.navBtn}
        >
          <IconArrowLeft size={14} /> Etapa precedentă
        </button>
        <div style={styles.stepCounter}>
          Etapa <strong style={{ color: '#e94560' }}>{activeIdx + 1}</strong> / {STAGES.length}
        </div>
        <button
          onClick={goNext}
          disabled={activeIdx === STAGES.length - 1}
          style={
            activeIdx === STAGES.length - 1
              ? { ...styles.navBtn, ...styles.navBtnDisabled }
              : styles.navBtn
          }
        >
          Etapa următoare <IconArrowRight size={14} />
        </button>
      </div>

      {/* LiDAR canvas visualization */}
      <div style={styles.canvasPanel}>
        <div style={styles.panelHead}>
          <span style={styles.panelTitle}>Vizualizare Nor de Puncte LiDAR</span>
          <span style={styles.panelSub}>Proiecție top-down · {stage.subtitle}</span>
        </div>
        <div ref={boxRef} style={styles.canvasBox}>
          <canvas ref={canvasRef} style={styles.canvas} />
        </div>
        <div style={styles.canvasCaption}>{stage.caption}</div>
      </div>

      {/* Stage description + stats */}
      <div style={styles.infoCard}>
        <div style={styles.infoHead}>
          <span style={styles.infoNum}>{stage.num}</span>
          <div style={{ flex: 1 }}>
            <div style={styles.infoTitle}>{stage.title}</div>
            <div style={styles.infoSub}>{stage.subtitle}</div>
          </div>
          <div style={styles.timingBadges}>
            {stage.processingTime !== null && (
              <span style={styles.timingBadge}>
                <IconClock size={12} /> {stage.processingTime.toFixed(1)} s
              </span>
            )}
            <div style={styles.progressBadge}>
              {activeIdx + 1} / {STAGES.length}
            </div>
          </div>
        </div>
        <p style={styles.infoDesc}>{stage.desc}</p>

        {stage.formula && (
          <div style={styles.formulaBox}>
            <span style={styles.formulaLabel}>Formula cheie</span>
            <code style={styles.formulaCode}>{stage.formula}</code>
          </div>
        )}

        <div style={styles.statGrid}>
          {stage.stats.map((st) => (
            <div key={st.label} style={styles.statItem}>
              <div style={styles.statValue}>{st.value}</div>
              <div style={styles.statLabel}>{st.label}</div>
            </div>
          ))}
        </div>

        <div style={styles.timelineBar}>
          <div style={styles.timelineHead}>
            <span style={styles.timelineLabel}>Timp cumulativ al pipeline-ului</span>
            <span style={styles.timelineValue}>
              {elapsed.toFixed(1)} s / {TOTAL_PIPELINE_TIME.toFixed(1)} s
            </span>
          </div>
          <div style={styles.timelineTrack}>
            <div
              style={{
                ...styles.timelineFill,
                width: `${(elapsed / TOTAL_PIPELINE_TIME) * 100}%`,
              }}
            />
          </div>
          {isFinalStage && (
            <div style={styles.finalSummary}>
              <IconCheck size={14} color="#27ae60" strokeWidth={2.4} />
              <span>Pipeline complet: <strong>{TOTAL_PIPELINE_TIME.toFixed(1)} s</strong> pentru <strong>1,2 M puncte</strong> · 6 clustere · 18 obiecte detectate · F1 = 87%</span>
            </div>
          )}
        </div>
      </div>

      {/* Source code footer */}
      <div style={styles.footNote}>
        <strong style={{ color: '#e94560' }}>Cod sursă:</strong>{' '}
        <code style={styles.code}>backend/pipeline/lidar_pipeline.py</code>{' '}·{' '}
        <code style={styles.code}>backend/models/lidar_classifier.py</code>{' '}·{' '}
        <code style={styles.code}>backend/utils/synthetic_data.py</code>
      </div>

      {/* ─── Real Data Test Section ─────────────────────────────────────── */}
      <div style={styles.realSection}>
        <div style={styles.realHeader}>
          <div>
            <h3 style={styles.realTitle}>Testează pe date reale</h3>
            <p style={styles.realSub}>
              Încarcă un nor de puncte LiDAR (.las, .laz, .xyz, .csv, .txt) și rulează
              pipeline-ul real pe date proprii.
            </p>
          </div>
          <a
            href={`${API_BASE}/api/lidar/sample`}
            style={styles.sampleLink}
            target="_blank"
            rel="noopener noreferrer"
            download
          >
            <IconDownload size={14} /> Descarcă un fișier de test
          </a>
        </div>

        {uploadState === 'idle' && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={isDragOver ? { ...styles.dropZone, ...styles.dropZoneActive } : styles.dropZone}
            >
              <div style={styles.dropIcon}>
                <IconUpload size={32} color="#e94560" />
              </div>
              <div style={styles.dropPrimary}>
                Trage fișierul aici sau <u>click pentru a selecta</u>
              </div>
              <div style={styles.dropSecondary}>
                .las · .laz · .xyz · .csv · .txt · maxim 50 MB
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".las,.laz,.xyz,.csv,.txt"
              style={{ display: 'none' }}
              onChange={(e) => e.target.files?.[0] && handlePickFile(e.target.files[0])}
            />
            {fileError && <div style={styles.errorBanner}>{fileError}</div>}
          </>
        )}

        {uploadState === 'ready' && selectedFile && (
          <div style={styles.readyCard}>
            <div style={styles.fileChip}>
              <span style={styles.fileIcon}><IconFile size={18} color="#e94560" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.fileName} title={selectedFile.name}>{selectedFile.name}</div>
                <div style={styles.fileMeta}>
                  {formatBytes(selectedFile.size)} · {(selectedFile.name.split('.').pop() || '').toUpperCase()}
                </div>
              </div>
              <button onClick={handleClear} style={styles.clearBtn} title="Elimină fișierul">
                <IconX size={14} />
              </button>
            </div>
            <button onClick={runRealPipeline} style={styles.runBtn}>
              <IconPlay size={14} color="#fff" /> Procesează acum
            </button>
          </div>
        )}

        {uploadState === 'processing' && (
          <div style={styles.processingCard}>
            <div style={styles.processingTitle}>Procesare în desfășurare…</div>
            <div style={styles.segmentTrack}>
              {REAL_STAGES.map((s, i) => {
                const done = i < progress.stageIdx;
                const active = i === progress.stageIdx;
                const pct = done ? 100 : active ? progress.stagePercent : 0;
                return (
                  <div key={s.key} style={styles.segment}>
                    <div style={styles.segmentLabel}>
                      <SegmentState done={done} active={active} /> {s.label}
                    </div>
                    <div style={styles.segmentBar}>
                      <div
                        style={{
                          ...styles.segmentFill,
                          width: `${pct}%`,
                          background: done ? '#27ae60' : '#e94560',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={styles.processingHint}>
              Upload → SOR → RANSAC → DBSCAN → CNN · rulează pe backend-ul FastAPI
            </div>
          </div>
        )}

        {uploadState === 'complete' && resultData && (
          <div style={styles.resultsWrapper}>
            <div style={styles.canvasPanel}>
              <div style={styles.panelHead}>
                <span style={styles.panelTitle}>Rezultate pe date reale</span>
                <span style={styles.panelSub}>
                  {resultData.source_filename || 'upload'} · {(resultData.processing_time_s || 0).toFixed(2)} s backend
                </span>
              </div>
              <div style={styles.canvasBox}>
                <canvas ref={resultCanvasRef} style={styles.canvas} />
              </div>
              <div style={styles.canvasCaption}>
                {resultData.num_clusters} clustere detectate ·{' '}
                {(resultData.total_points || 0).toLocaleString('ro-RO')} puncte ·{' '}
                {resultData.detections_saved} salvate în baza de date
              </div>
            </div>

            <div style={styles.resultsSummary}>
              <div style={styles.summaryGrid}>
                <div style={styles.summaryItem}>
                  <div style={styles.summaryValue}>{resultData.num_clusters}</div>
                  <div style={styles.summaryLabel}>Clustere</div>
                </div>
                <div style={styles.summaryItem}>
                  <div style={styles.summaryValue}>
                    {(resultData.total_points || 0).toLocaleString('ro-RO')}
                  </div>
                  <div style={styles.summaryLabel}>Puncte totale</div>
                </div>
                <div style={styles.summaryItem}>
                  <div style={styles.summaryValue}>
                    {(resultData.processing_time_s || 0).toFixed(2)} s
                  </div>
                  <div style={styles.summaryLabel}>Timp backend</div>
                </div>
                <div style={styles.summaryItem}>
                  <div style={styles.summaryValue}>{resultData.detections_saved}</div>
                  <div style={styles.summaryLabel}>Salvate în DB</div>
                </div>
              </div>

              {categoryBreakdown.length > 0 && (
                <table style={styles.breakdown}>
                  <thead>
                    <tr>
                      <th style={styles.th}>Categorie</th>
                      <th style={styles.th}>Nr. obiecte</th>
                      <th style={styles.th}>Volum estimat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryBreakdown.map((r) => (
                      <tr key={r.category}>
                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.catSwatch,
                              background: CATEGORY_COLORS[r.category] || '#888',
                            }}
                          />
                          {r.category}
                        </td>
                        <td style={styles.td}>{r.count}</td>
                        <td style={styles.td}>{r.volume.toFixed(2)} m³</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div style={styles.resultsActions}>
                <button onClick={downloadResultJSON} style={styles.downloadBtn}>
                  <IconDownload size={14} /> Descarcă rezultate (.json)
                </button>
                <button onClick={handleClear} style={styles.resetBtn}>
                  <IconRefresh size={14} /> Procesează alt fișier
                </button>
              </div>
            </div>
          </div>
        )}

        {uploadState === 'error' && (
          <div style={styles.errorCard}>
            <div style={styles.errorTitle}>
              <IconAlert size={16} color="#e94560" /> Procesarea a eșuat
            </div>
            <div style={styles.errorMsg}>{processingError}</div>
            <div style={styles.errorActions}>
              <button
                onClick={runRealPipeline}
                style={selectedFile ? styles.runBtn : { ...styles.runBtn, opacity: 0.4, cursor: 'not-allowed' }}
                disabled={!selectedFile}
              >
                <IconRefresh size={14} color="#fff" /> Reîncearcă
              </button>
              <button onClick={handleClear} style={styles.resetBtn}>
                Încarcă alt fișier
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small helper for the per-stage progress state indicator ─────────────
function SegmentState({ done, active }) {
  if (done) return <IconCheck size={11} color="#27ae60" strokeWidth={2.6} />;
  if (active) {
    return (
      <span style={{
        display: 'inline-block', width: 8, height: 8,
        borderRadius: 4, background: '#e94560',
        boxShadow: '0 0 6px rgba(233,69,96,0.6)',
      }} />
    );
  }
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8,
      borderRadius: 4, border: '1px solid #4a5468', background: 'transparent',
    }} />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────
const styles = {
  page: {
    padding: '28px 32px 40px',
    minHeight: 'calc(100vh - 56px)',
    background: '#0a0e1a',
    color: '#e0e0e0',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 20,
    flexWrap: 'wrap',
  },
  title: { margin: 0, fontSize: '1.65rem', fontWeight: 700, color: '#e0e0e0' },
  subtitle: {
    margin: '6px 0 0 0',
    color: '#8892a4',
    fontSize: '0.92rem',
    maxWidth: 760,
    lineHeight: 1.5,
  },
  playBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 18px',
    background: 'rgba(15, 22, 41, 0.8)',
    border: '1px solid rgba(233,69,96,0.3)',
    borderRadius: 8,
    color: '#e94560',
    fontSize: '0.88rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.18s ease',
    whiteSpace: 'nowrap',
  },
  playBtnActive: {
    background: 'linear-gradient(135deg, #e94560, #c23152)',
    color: '#fff',
    border: '1px solid transparent',
    boxShadow: '0 4px 14px rgba(233,69,96,0.35)',
  },
  playIcon: { display: 'inline-flex', alignItems: 'center' },

  pipelineBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: 14,
    overflowX: 'auto',
    paddingBottom: 8,
  },
  stageCard: {
    flex: '1 1 0',
    minWidth: 130,
    padding: '12px 10px',
    background: 'rgba(15, 22, 41, 0.7)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    cursor: 'pointer',
    textAlign: 'left',
    color: '#8892a4',
    transition: 'all 0.18s ease',
  },
  stageCardActive: {
    background: 'linear-gradient(135deg, rgba(233,69,96,0.18), rgba(233,69,96,0.05))',
    border: '1px solid rgba(233,69,96,0.5)',
    color: '#e0e0e0',
    boxShadow: '0 4px 16px rgba(233,69,96,0.2)',
    transform: 'translateY(-2px)',
  },
  stageCardDone: {
    borderColor: 'rgba(39,174,96,0.25)',
    background: 'rgba(39,174,96,0.04)',
  },
  stageNum: {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: '#4a5468',
    marginBottom: 5,
  },
  stageNumActive: { color: '#e94560' },
  stageNumDone: { color: '#27ae60' },
  stageIcon: { marginBottom: 5, display: 'flex' },
  stageTitle: { fontSize: '0.88rem', fontWeight: 600, marginBottom: 2 },
  stageSub: { fontSize: '0.7rem', opacity: 0.65 },
  arrow: {
    color: '#2a3040',
    flexShrink: 0,
    transition: 'color 0.18s',
    display: 'flex',
    alignItems: 'center',
  },
  arrowDone: { color: '#27ae60' },

  navControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
    padding: '0 4px',
  },
  navBtn: {
    padding: '8px 16px',
    background: 'rgba(15, 22, 41, 0.8)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#e0e0e0',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.18s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  navBtnDisabled: {
    opacity: 0.35,
    cursor: 'not-allowed',
  },
  stepCounter: {
    fontSize: '0.9rem',
    color: '#8892a4',
    fontWeight: 500,
    letterSpacing: '0.02em',
  },

  canvasPanel: {
    background: 'rgba(15, 22, 41, 0.7)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    display: 'flex',
    flexDirection: 'column',
  },
  panelHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 6,
  },
  panelTitle: { fontSize: '0.95rem', fontWeight: 600, color: '#e0e0e0' },
  panelSub: { fontSize: '0.75rem', color: '#4a5468' },

  canvasBox: {
    width: '100%',
    aspectRatio: `${CANVAS_W} / ${CANVAS_H}`,
    borderRadius: 8,
    overflow: 'hidden',
    border: '1px solid rgba(255,255,255,0.04)',
    background: '#0a0a1a',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  canvasCaption: {
    marginTop: 12,
    padding: '10px 14px',
    background: 'rgba(10, 14, 26, 0.7)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 6,
    fontSize: '0.82rem',
    color: '#b5bdcc',
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    lineHeight: 1.5,
  },

  infoCard: {
    background: 'rgba(15, 22, 41, 0.7)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 22,
    marginBottom: 18,
  },
  infoHead: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 },
  infoNum: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 10,
    background: 'linear-gradient(135deg, #e94560, #c23152)',
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.95rem',
    flexShrink: 0,
  },
  infoTitle: { fontSize: '1.15rem', fontWeight: 700, color: '#e0e0e0' },
  infoSub: { fontSize: '0.78rem', color: '#8892a4' },
  timingBadges: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  timingBadge: {
    padding: '5px 10px',
    background: 'rgba(39,174,96,0.1)',
    border: '1px solid rgba(39,174,96,0.25)',
    borderRadius: 6,
    color: '#27ae60',
    fontSize: '0.78rem',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
  },
  progressBadge: {
    padding: '5px 12px',
    background: 'rgba(233,69,96,0.1)',
    border: '1px solid rgba(233,69,96,0.25)',
    borderRadius: 6,
    color: '#e94560',
    fontSize: '0.78rem',
    fontWeight: 600,
    letterSpacing: '0.03em',
  },
  infoDesc: { lineHeight: 1.65, fontSize: '0.92rem', color: '#b5bdcc', margin: '0 0 14px 0' },
  formulaBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 14px',
    background: 'rgba(10, 14, 26, 0.7)',
    border: '1px dashed rgba(233,69,96,0.35)',
    borderRadius: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  formulaLabel: {
    fontSize: '0.7rem',
    color: '#8892a4',
    fontWeight: 600,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  formulaCode: {
    flex: 1,
    padding: '6px 10px',
    background: 'rgba(233,69,96,0.08)',
    color: '#e94560',
    borderRadius: 4,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    fontSize: '0.88rem',
    fontWeight: 500,
    minWidth: 200,
  },
  statGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 10,
    marginBottom: 16,
  },
  statItem: {
    padding: '11px 13px',
    background: 'rgba(10, 14, 26, 0.7)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 8,
  },
  statValue: { fontSize: '1rem', fontWeight: 700, color: '#e94560', marginBottom: 2 },
  statLabel: { fontSize: '0.72rem', color: '#8892a4' },

  timelineBar: {
    padding: '12px 14px',
    background: 'rgba(10, 14, 26, 0.5)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 8,
  },
  timelineHead: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: 8,
    fontSize: '0.8rem',
  },
  timelineLabel: { color: '#8892a4' },
  timelineValue: { color: '#27ae60', fontWeight: 700, fontFamily: "'JetBrains Mono', 'Consolas', monospace" },
  timelineTrack: {
    height: 6,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  timelineFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #27ae60, #e94560)',
    transition: 'width 0.4s ease',
  },
  finalSummary: {
    marginTop: 10,
    padding: '10px 12px',
    background: 'rgba(39,174,96,0.08)',
    border: '1px solid rgba(39,174,96,0.25)',
    borderRadius: 6,
    color: '#b5bdcc',
    fontSize: '0.85rem',
    lineHeight: 1.5,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },

  footNote: {
    padding: '14px 18px',
    background: 'rgba(15, 22, 41, 0.5)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 8,
    fontSize: '0.78rem',
    color: '#8892a4',
  },
  code: {
    padding: '2px 6px',
    background: 'rgba(233,69,96,0.08)',
    color: '#e94560',
    borderRadius: 4,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    fontSize: '0.75rem',
  },

  // ─── Real data test section ─────────────────────────────────────────────
  realSection: {
    marginTop: 24,
    background: 'rgba(15, 22, 41, 0.7)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 22,
  },
  realHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 20,
    marginBottom: 18,
    flexWrap: 'wrap',
  },
  realTitle: { margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#e0e0e0' },
  realSub: {
    margin: '4px 0 0 0',
    color: '#8892a4',
    fontSize: '0.88rem',
    maxWidth: 620,
    lineHeight: 1.5,
  },
  sampleLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '8px 14px',
    background: 'rgba(10, 14, 26, 0.7)',
    border: '1px solid rgba(233,69,96,0.3)',
    borderRadius: 8,
    color: '#e94560',
    fontSize: '0.82rem',
    fontWeight: 600,
    textDecoration: 'none',
    whiteSpace: 'nowrap',
  },

  dropZone: {
    padding: '40px 20px',
    textAlign: 'center',
    border: '2px dashed rgba(255,255,255,0.15)',
    borderRadius: 10,
    background: 'rgba(10, 14, 26, 0.5)',
    color: '#8892a4',
    cursor: 'pointer',
    transition: 'all 0.18s ease',
  },
  dropZoneActive: {
    borderColor: '#e94560',
    background: 'rgba(233,69,96,0.06)',
    color: '#e0e0e0',
  },
  dropIcon: { marginBottom: 8, display: 'flex', justifyContent: 'center' },
  dropPrimary: { fontSize: '1rem', fontWeight: 500, marginBottom: 4, color: '#e0e0e0' },
  dropSecondary: { fontSize: '0.8rem', color: '#8892a4' },

  errorBanner: {
    marginTop: 12,
    padding: '10px 14px',
    background: 'rgba(208,2,27,0.08)',
    border: '1px solid rgba(208,2,27,0.3)',
    borderRadius: 6,
    color: '#ff6b7a',
    fontSize: '0.85rem',
  },

  readyCard: { display: 'flex', flexDirection: 'column', gap: 14 },
  fileChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 14px',
    background: 'rgba(10, 14, 26, 0.7)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 8,
  },
  fileIcon: { display: 'inline-flex', alignItems: 'center' },
  fileName: {
    fontSize: '0.92rem',
    fontWeight: 600,
    color: '#e0e0e0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileMeta: { fontSize: '0.75rem', color: '#8892a4', marginTop: 2 },
  clearBtn: {
    padding: '6px 8px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    color: '#8892a4',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  runBtn: {
    padding: '12px 22px',
    background: 'linear-gradient(135deg, #e94560, #c23152)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: '0.92rem',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(233,69,96,0.35)',
    alignSelf: 'flex-start',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  },

  processingCard: {
    padding: '18px 20px',
    background: 'rgba(10, 14, 26, 0.5)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
  },
  processingTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#e0e0e0',
    marginBottom: 14,
  },
  segmentTrack: {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 10,
    marginBottom: 12,
  },
  segment: {},
  segmentLabel: {
    fontSize: '0.78rem',
    fontWeight: 500,
    color: '#b5bdcc',
    marginBottom: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  segmentBar: {
    height: 6,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  segmentFill: {
    height: '100%',
    transition: 'width 0.15s ease',
  },
  processingHint: {
    fontSize: '0.82rem',
    color: '#8892a4',
    fontStyle: 'italic',
  },

  resultsWrapper: { display: 'flex', flexDirection: 'column', gap: 16 },
  resultsSummary: {
    padding: 18,
    background: 'rgba(10, 14, 26, 0.5)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: 10,
    marginBottom: 14,
  },
  summaryItem: {
    padding: '10px 12px',
    background: 'rgba(15, 22, 41, 0.7)',
    border: '1px solid rgba(255,255,255,0.04)',
    borderRadius: 8,
  },
  summaryValue: { fontSize: '1.05rem', fontWeight: 700, color: '#27ae60' },
  summaryLabel: { fontSize: '0.72rem', color: '#8892a4', marginTop: 3 },

  breakdown: {
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: 14,
    fontSize: '0.85rem',
  },
  th: {
    padding: '8px 10px',
    textAlign: 'left',
    color: '#8892a4',
    fontWeight: 600,
    fontSize: '0.72rem',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  td: {
    padding: '9px 10px',
    color: '#e0e0e0',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  catSwatch: {
    display: 'inline-block',
    width: 10,
    height: 10,
    borderRadius: 2,
    marginRight: 8,
    verticalAlign: 'middle',
  },

  resultsActions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  downloadBtn: {
    padding: '10px 18px',
    background: 'rgba(39,174,96,0.12)',
    border: '1px solid rgba(39,174,96,0.35)',
    borderRadius: 8,
    color: '#27ae60',
    fontSize: '0.85rem',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  resetBtn: {
    padding: '10px 18px',
    background: 'rgba(15, 22, 41, 0.8)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    color: '#e0e0e0',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },

  errorCard: {
    padding: 20,
    background: 'rgba(208,2,27,0.05)',
    border: '1px solid rgba(208,2,27,0.3)',
    borderRadius: 10,
  },
  errorTitle: {
    fontSize: '1rem', fontWeight: 700, color: '#ff6b7a', marginBottom: 6,
    display: 'flex', alignItems: 'center', gap: 8,
  },
  errorMsg: { fontSize: '0.9rem', color: '#e0e0e0', marginBottom: 14, lineHeight: 1.5 },
  errorActions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
};
