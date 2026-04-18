import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ResponsiveContainer,
} from 'recharts';
import theme from '../theme';
import { formatNumber, formatCoord, formatDistance, formatDateTime } from '../utils/format';
import { IconBan, IconPlay, IconDownload } from './Icons';

const t = theme;

const HOUR_MARKS = [1, 6, 12, 24];

// --- Data helpers ---------------------------------------------------------

function pickTrajectory(data) {
  if (!data) return null;
  return data.trajectory || data;
}

function snapshotFor(trajectory, hour) {
  if (!trajectory) return {};
  return trajectory[`hour_${hour}`] || {};
}

function interpolateSnapshot(trajectory, hour) {
  // Get all available hour marks, find nearest bracket, interpolate linearly.
  if (!trajectory) return null;
  const points = HOUR_MARKS
    .map((h) => ({ h, snap: trajectory[`hour_${h}`] }))
    .filter((p) => p.snap && p.snap.centroid);
  if (points.length === 0) return null;
  if (hour <= points[0].h) return points[0].snap;
  if (hour >= points[points.length - 1].h) return points[points.length - 1].snap;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]; const b = points[i + 1];
    if (hour >= a.h && hour <= b.h) {
      const ratio = (hour - a.h) / (b.h - a.h);
      return {
        centroid: [
          a.snap.centroid[0] + (b.snap.centroid[0] - a.snap.centroid[0]) * ratio,
          a.snap.centroid[1] + (b.snap.centroid[1] - a.snap.centroid[1]) * ratio,
        ],
        uncertainty_radius_km:
          (a.snap.uncertainty_radius_km || 0) +
          ((b.snap.uncertainty_radius_km || 0) - (a.snap.uncertainty_radius_km || 0)) * ratio,
      };
    }
  }
  return points[points.length - 1].snap;
}

// Haversine distance in km between two [lat, lon] points.
function haversineKm([lat1, lon1], [lat2, lon2]) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// --- Cone canvas renderer -------------------------------------------------

function renderCone(canvas, { origin, trajectory, selectedHour }) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, cssW, cssH);

  // Background
  ctx.fillStyle = t.color.bgInset;
  ctx.fillRect(0, 0, cssW, cssH);

  if (!origin || !trajectory) return;

  // Determine world extent — origin at center, max uncertainty radius defines km scale.
  const snapshots = HOUR_MARKS.map((h) => ({ h, s: trajectory[`hour_${h}`] })).filter(x => x.s);
  if (snapshots.length === 0) return;

  // Max distance = max centroid displacement + max radius, with a 15 % padding.
  let maxKm = 0;
  snapshots.forEach(({ s }) => {
    if (s.centroid) {
      const d = haversineKm([origin.lat, origin.lon], s.centroid);
      maxKm = Math.max(maxKm, d + (s.uncertainty_radius_km || 0));
    } else {
      maxKm = Math.max(maxKm, s.uncertainty_radius_km || 0);
    }
  });
  maxKm = Math.max(maxKm, 0.5) * 1.15;

  const cx = cssW / 2;
  const cy = cssH / 2;
  const radius = Math.min(cssW, cssH) / 2 - 28;
  const kmToPx = radius / maxKm;

  // Project a [lat, lon] to canvas coords, assuming small area (flat-earth).
  const project = (lat, lon) => {
    const dy = (lat - origin.lat) * 111; // km/deg lat
    const dx = (lon - origin.lon) * 111 * Math.cos((origin.lat * Math.PI) / 180);
    return { x: cx + dx * kmToPx, y: cy - dy * kmToPx };
  };

  // Background compass grid circles at 25% / 50% / 75% / 100% of maxKm
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  [0.25, 0.5, 0.75, 1].forEach((r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radius * r, 0, 2 * Math.PI);
    ctx.stroke();
  });

  // Cardinal cross
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  // Compass labels
  ctx.fillStyle = t.color.textDim;
  ctx.font = `600 11px ${t.font.family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - radius - 12);
  ctx.fillText('S', cx, cy + radius + 12);
  ctx.fillText('E', cx + radius + 12, cy);
  ctx.fillText('V', cx - radius - 12, cy);

  // Trajectory path connecting centroids (hour 1 → 24)
  ctx.strokeStyle = 'rgba(233, 69, 96, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  snapshots.forEach(({ s }, i) => {
    if (!s.centroid) return;
    const p = project(s.centroid[0], s.centroid[1]);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // Uncertainty cones for each hour — filled circles with opacity decreasing by hour (later = more uncertain).
  // Selected hour is highlighted.
  const hourColors = {
    1: 'rgba(233, 69, 96, 0.55)',
    6: 'rgba(233, 69, 96, 0.40)',
    12: 'rgba(233, 69, 96, 0.28)',
    24: 'rgba(233, 69, 96, 0.18)',
  };
  snapshots.forEach(({ h, s }) => {
    if (!s.centroid) return;
    const p = project(s.centroid[0], s.centroid[1]);
    const r = (s.uncertainty_radius_km || 0) * kmToPx;
    const isSel = h === selectedHour;

    // Fill
    ctx.fillStyle = hourColors[h] || 'rgba(233, 69, 96, 0.2)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
    ctx.fill();

    // Border — stronger for selected
    ctx.strokeStyle = isSel ? t.color.accent : 'rgba(233, 69, 96, 0.5)';
    ctx.lineWidth = isSel ? 2.5 : 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
    ctx.stroke();

    // Hour label
    ctx.fillStyle = isSel ? t.color.accent : t.color.textMuted;
    ctx.font = `${isSel ? 700 : 500} 11px ${t.font.family}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${h}h`, p.x, p.y - r - 7);
  });

  // Interpolated marker for the currently selected hour (if it's between marks).
  const interp = interpolateSnapshot(trajectory, selectedHour);
  if (interp && interp.centroid && !HOUR_MARKS.includes(selectedHour)) {
    const p = project(interp.centroid[0], interp.centroid[1]);
    const r = (interp.uncertainty_radius_km || 0) * kmToPx;
    ctx.strokeStyle = t.color.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = t.color.accent;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Origin marker — bullseye
  ctx.fillStyle = t.color.accent;
  ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, 2 * Math.PI); ctx.fill();

  // Origin label
  ctx.fillStyle = t.color.text;
  ctx.font = `600 11px ${t.font.family}`;
  ctx.textBaseline = 'top';
  ctx.fillText('Origine', cx, cy + 10);

  // Scale bar (1 km) bottom-left
  const scaleKm = maxKm > 5 ? 2 : 1;
  const barLen = scaleKm * kmToPx;
  const barX = 14;
  const barY = cssH - 20;
  ctx.strokeStyle = t.color.text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(barX, barY);
  ctx.lineTo(barX + barLen, barY);
  ctx.moveTo(barX, barY - 4); ctx.lineTo(barX, barY + 4);
  ctx.moveTo(barX + barLen, barY - 4); ctx.lineTo(barX + barLen, barY + 4);
  ctx.stroke();
  ctx.fillStyle = t.color.textMuted;
  ctx.font = `500 10px ${t.font.family}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`${scaleKm} km`, barX, barY - 6);
}

// --- Custom chart tooltip -------------------------------------------------

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={styles.chartTooltip}>
      <div style={{ fontWeight: 600, marginBottom: 4, color: t.color.accent }}>{label}</div>
      <div style={{ fontSize: t.font.small }}>
        Rază incertitudine: <strong>{formatDistance(p.uncertainty_km)}</strong>
      </div>
    </div>
  );
}

// --- GeoJSON export -------------------------------------------------------

function buildGeoJSON(data) {
  const origin = data.origin || {};
  const traj = pickTrajectory(data);
  const features = [];

  if (origin.lat != null && origin.lon != null) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [origin.lon, origin.lat] },
      properties: { kind: 'origin', label: 'Punct de origine' },
    });
  }

  HOUR_MARKS.forEach((h) => {
    const s = snapshotFor(traj, h);
    if (!s.centroid) return;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.centroid[1], s.centroid[0]] },
      properties: {
        kind: 'centroid',
        hour: h,
        uncertainty_radius_km: s.uncertainty_radius_km || 0,
      },
    });
    // Approximate uncertainty circle as a 64-vertex polygon
    const r = s.uncertainty_radius_km || 0;
    if (r > 0) {
      const poly = [];
      const lat = s.centroid[0]; const lon = s.centroid[1];
      const cosLat = Math.cos((lat * Math.PI) / 180);
      for (let i = 0; i <= 64; i++) {
        const ang = (i / 64) * 2 * Math.PI;
        const dLat = (r / 111) * Math.sin(ang);
        const dLon = (r / (111 * cosLat)) * Math.cos(ang);
        poly.push([lon + dLon, lat + dLat]);
      }
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [poly] },
        properties: {
          kind: 'uncertainty_cone',
          hour: h,
          uncertainty_radius_km: r,
        },
      });
    }
  });

  return { type: 'FeatureCollection', features };
}

function downloadGeoJSON(data) {
  const gj = buildGeoJSON(data);
  const blob = new Blob([JSON.stringify(gj, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ravens-predictie-${Date.now()}.geojson`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

// --- Main component -------------------------------------------------------

export default function PredictionPanel({ data, onGenerateDemo }) {
  const [rawHour, setRawHour] = useState(1);
  const [debouncedHour, setDebouncedHour] = useState(1);
  const canvasRef = useRef(null);

  // Debounce slider -> canvas render to avoid jank while dragging
  useEffect(() => {
    const id = setTimeout(() => setDebouncedHour(rawHour), 80);
    return () => clearTimeout(id);
  }, [rawHour]);

  const trajectory = useMemo(() => pickTrajectory(data), [data]);
  const origin = data?.origin;
  const discharge = (trajectory?.discharge) || {};

  const currentSnap = useMemo(
    () => interpolateSnapshot(trajectory, debouncedHour) || {},
    [trajectory, debouncedHour]
  );

  // Discharge chart series
  const chartData = useMemo(() => {
    if (!trajectory) return [];
    return HOUR_MARKS.map((h) => {
      const s = trajectory[`hour_${h}`] || {};
      return {
        hour: `${h}h`,
        hourNum: h,
        uncertainty_km: s.uncertainty_radius_km || 0,
      };
    });
  }, [trajectory]);

  const avgUncertainty = useMemo(() => {
    if (chartData.length === 0) return 0;
    return chartData.reduce((s, d) => s + d.uncertainty_km, 0) / chartData.length;
  }, [chartData]);

  // Centroid distance from origin for the selected hour
  const distKm = useMemo(() => {
    if (!origin || !currentSnap?.centroid) return null;
    return haversineKm([origin.lat, origin.lon], currentSnap.centroid);
  }, [origin, currentSnap]);

  // Re-render canvas on any change
  useEffect(() => {
    renderCone(canvasRef.current, { origin, trajectory, selectedHour: debouncedHour });
  }, [origin, trajectory, debouncedHour]);

  // Resize canvas on window resize
  useEffect(() => {
    const handler = () => renderCone(canvasRef.current, { origin, trajectory, selectedHour: debouncedHour });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [origin, trajectory, debouncedHour]);

  if (!data || !trajectory) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyCard}>
          <div style={styles.emptyIcon}><IconBan size={42} color={t.color.textFaint} /></div>
          <div style={styles.emptyTitle}>Nicio predicție disponibilă</div>
          <p style={styles.emptyText}>
            Pentru a vedea aici predicția traseului unui poluant, generează un set de date demo.
            Vei primi traiectoria pentru 1h / 6h / 12h / 24h, împreună cu raza de incertitudine
            la fiecare orizont temporal.
          </p>
          {onGenerateDemo && (
            <button style={styles.emptyBtn} onClick={onGenerateDemo}>
              <IconPlay size={14} color="#fff" /> Generează Date Demo
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.headRow}>
        <div>
          <h2 style={styles.heading}>Predicție Traseu Poluanți</h2>
          <p style={styles.sub}>
            Model de dispersie hidrodinamică — traiectoria centroidului și raza de incertitudine
            pentru fiecare orizont temporal.
          </p>
        </div>
        <button style={styles.downloadBtn} onClick={() => downloadGeoJSON(data)}>
          <IconDownload size={14} /> Descarcă predicție (.geojson)
        </button>
      </div>

      {/* Metric row */}
      <div style={styles.metricRow}>
        <MetricCard
          label="Origine (lat, lon)"
          value={origin ? `${formatCoord(origin.lat)}, ${formatCoord(origin.lon)}` : '—'}
          accent={t.color.accent}
          mono
        />
        <MetricCard
          label="Debit / Viteză"
          value={`${discharge.discharge_m3s != null ? discharge.discharge_m3s.toFixed(1) : '—'} m³/s`}
          hint={discharge.velocity_ms != null ? `Viteză ${discharge.velocity_ms.toFixed(2)} m/s` : null}
          accent={t.color.info}
        />
        <MetricCard
          label="Distanță prezisă"
          value={distKm != null ? formatDistance(distKm) : '—'}
          hint={`Orizont ${debouncedHour}h`}
          accent={t.color.warning}
        />
        <MetricCard
          label="Rază incertitudine"
          value={formatDistance(currentSnap.uncertainty_radius_km || 0)}
          hint={`Orizont ${debouncedHour}h`}
          accent={t.color.success}
        />
      </div>

      {/* Slider */}
      <div style={styles.sliderCard}>
        <div style={styles.sliderHead}>
          <div>
            <div style={styles.sliderTitle}>Orizont temporal</div>
            <div style={styles.sliderHint}>Selectează un moment între 1 și 24 ore pentru a vedea dispersia prezisă</div>
          </div>
          <div style={styles.sliderHourBox}>
            <span style={styles.sliderHourValue}>{debouncedHour}</span>
            <span style={styles.sliderHourUnit}>ore</span>
          </div>
        </div>
        <div style={styles.sliderRow}>
          <input
            type="range"
            min={1}
            max={24}
            step={1}
            value={rawHour}
            onChange={(e) => setRawHour(Number(e.target.value))}
            style={styles.slider}
          />
        </div>
        <div style={styles.sliderTicks}>
          {HOUR_MARKS.map((h) => (
            <button
              key={h}
              onClick={() => setRawHour(h)}
              style={{
                ...styles.sliderTick,
                color: rawHour === h ? t.color.accent : t.color.textDim,
                fontWeight: rawHour === h ? t.font.weight.bold : t.font.weight.medium,
              }}
            >
              <span style={{
                ...styles.sliderTickDot,
                background: rawHour === h ? t.color.accent : t.color.textFaint,
              }} />
              {h}h
            </button>
          ))}
        </div>
      </div>

      {/* Main visualization + discharge chart */}
      <div style={styles.visRow}>
        <div style={styles.coneCard}>
          <div style={styles.sectionHead}>
            <span style={styles.sectionTitle}>Con de probabilitate</span>
            <span style={styles.sectionHint}>Orizont activ: <strong style={{ color: t.color.accent }}>{debouncedHour}h</strong></span>
          </div>
          <div style={styles.canvasWrap}>
            <canvas ref={canvasRef} style={styles.canvas} />
          </div>
          <div style={styles.coneLegend}>
            {HOUR_MARKS.map((h) => (
              <span key={h} style={styles.coneLegendItem}>
                <span style={{
                  ...styles.coneLegendSwatch,
                  background: `rgba(233, 69, 96, ${h === 1 ? 0.55 : h === 6 ? 0.4 : h === 12 ? 0.28 : 0.18})`,
                  border: `1px solid rgba(233, 69, 96, 0.6)`,
                }} />
                <span style={{
                  color: debouncedHour === h ? t.color.accent : t.color.textMuted,
                  fontWeight: debouncedHour === h ? t.font.weight.semibold : t.font.weight.medium,
                }}>{h}h</span>
              </span>
            ))}
          </div>
        </div>

        <div style={styles.chartCard}>
          <div style={styles.sectionHead}>
            <span style={styles.sectionTitle}>Dispersie în timp</span>
            <span style={styles.sectionHint}>Rază incertitudine pe orizont</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 12, right: 18, left: 0, bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="hour"
                tick={{ fill: t.color.textDim, fontSize: 11 }}
                label={{ value: 'Orizont temporal', position: 'insideBottom', dy: 18, fill: t.color.textDim, fontSize: 12 }}
              />
              <YAxis
                tick={{ fill: t.color.textDim, fontSize: 11 }}
                label={{ value: 'Rază (km)', angle: -90, position: 'insideLeft', fill: t.color.textDim, fontSize: 12 }}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: t.color.accent, strokeOpacity: 0.3 }} />
              {/* Highlight the "active" window around the selected hour */}
              <ReferenceArea
                x1={chartData.find((d) => d.hourNum >= debouncedHour)?.hour || `${debouncedHour}h`}
                x2={chartData.find((d) => d.hourNum >= debouncedHour)?.hour || `${debouncedHour}h`}
                strokeOpacity={0}
                fill={t.color.accent}
                fillOpacity={0.08}
              />
              <ReferenceLine
                y={avgUncertainty}
                stroke={t.color.textFaint}
                strokeDasharray="4 4"
                label={{
                  value: `medie ${avgUncertainty.toFixed(1)} km`,
                  position: 'insideTopRight',
                  fill: t.color.textDim,
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="uncertainty_km"
                stroke={t.color.accent}
                strokeWidth={2.5}
                dot={{ fill: t.color.accent, r: 5, strokeWidth: 0 }}
                activeDot={{ r: 7, stroke: '#fff', strokeWidth: 2 }}
                name="Incertitudine"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, hint, accent, mono }) {
  return (
    <div style={styles.metricCard}>
      <div style={{
        ...styles.metricValue,
        color: accent,
        fontFamily: mono ? t.font.mono : t.font.family,
        fontSize: mono ? t.font.metricSm : t.font.metricMd,
      }}>
        {value}
      </div>
      <div style={styles.metricLabel}>{label}</div>
      {hint && <div style={styles.metricHint}>{hint}</div>}
    </div>
  );
}

const styles = {
  container: {
    padding: '28px 32px 40px',
    minHeight: 'calc(100vh - 56px)',
    background: t.color.bg,
    color: t.color.text,
  },
  headRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  heading: {
    margin: 0,
    fontSize: t.font.h2,
    fontWeight: t.font.weight.bold,
    color: t.color.text,
  },
  sub: {
    margin: '6px 0 0 0',
    color: t.color.textDim,
    fontSize: t.font.body,
    maxWidth: 760,
    lineHeight: 1.5,
  },
  downloadBtn: {
    padding: '9px 16px',
    background: t.color.accentBg,
    color: t.color.accent,
    border: `1px solid ${t.color.accentBorder}`,
    borderRadius: t.radius.md,
    fontSize: t.font.small,
    fontWeight: t.font.weight.semibold,
    cursor: 'pointer',
    transition: t.transition.fast,
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },

  metricRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    padding: '16px 20px',
    background: t.color.bgCard,
    border: `1px solid ${t.color.border}`,
    borderRadius: t.radius.xl,
  },
  metricValue: {
    fontWeight: t.font.weight.bold,
    lineHeight: 1.15,
    letterSpacing: '-0.01em',
  },
  metricLabel: {
    fontSize: t.font.small,
    color: t.color.textDim,
    marginTop: 4,
    fontWeight: t.font.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  metricHint: {
    fontSize: t.font.caption,
    color: t.color.textFaint,
    marginTop: 4,
  },

  sliderCard: {
    background: t.color.bgCard,
    border: `1px solid ${t.color.border}`,
    borderRadius: t.radius.xl,
    padding: '18px 22px 14px',
    marginBottom: 20,
  },
  sliderHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 10,
  },
  sliderTitle: {
    fontSize: t.font.bodyLg,
    fontWeight: t.font.weight.semibold,
    color: t.color.text,
  },
  sliderHint: {
    fontSize: t.font.caption,
    color: t.color.textDim,
    marginTop: 2,
  },
  sliderHourBox: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 6,
    padding: '6px 14px',
    background: t.color.accentBg,
    borderRadius: t.radius.md,
    border: `1px solid ${t.color.accentBorder}`,
  },
  sliderHourValue: {
    fontSize: t.font.metricSm,
    fontWeight: t.font.weight.bold,
    color: t.color.accent,
    fontFamily: t.font.mono,
    minWidth: 28,
    textAlign: 'right',
  },
  sliderHourUnit: {
    fontSize: t.font.small,
    color: t.color.accent,
    fontWeight: t.font.weight.medium,
  },
  sliderRow: {
    padding: '0 6px',
  },
  slider: {
    width: '100%',
    accentColor: t.color.accent,
    cursor: 'pointer',
  },
  sliderTicks: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 8,
    padding: '0 2px',
  },
  sliderTick: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: t.font.small,
    padding: '4px 6px',
    borderRadius: t.radius.sm,
    transition: t.transition.fast,
  },
  sliderTickDot: {
    display: 'inline-block',
    width: 6, height: 6, borderRadius: 3,
    transition: t.transition.fast,
  },

  visRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  coneCard: {
    background: t.color.bgCard,
    border: `1px solid ${t.color.border}`,
    borderRadius: t.radius.xl,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 420,
  },
  canvasWrap: {
    flex: 1,
    minHeight: 320,
    borderRadius: t.radius.md,
    overflow: 'hidden',
    border: `1px solid ${t.color.border}`,
    background: t.color.bgInset,
  },
  canvas: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  coneLegend: {
    display: 'flex',
    justifyContent: 'center',
    gap: 14,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  coneLegendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: t.font.small,
  },
  coneLegendSwatch: {
    display: 'inline-block',
    width: 14, height: 14,
    borderRadius: t.radius.full,
  },

  chartCard: {
    background: t.color.bgCard,
    border: `1px solid ${t.color.border}`,
    borderRadius: t.radius.xl,
    padding: 18,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 420,
  },
  sectionHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionTitle: {
    fontSize: t.font.bodyLg,
    fontWeight: t.font.weight.semibold,
    color: t.color.text,
  },
  sectionHint: {
    fontSize: t.font.caption,
    color: t.color.textDim,
    fontWeight: t.font.weight.medium,
  },
  chartTooltip: {
    background: t.color.bgCardSolid,
    border: `1px solid ${t.color.borderStrong}`,
    borderRadius: t.radius.md,
    padding: '8px 12px',
    color: t.color.text,
    fontSize: t.font.body,
    boxShadow: t.shadow.md,
  },

  emptyCard: {
    maxWidth: 520,
    margin: '80px auto 0',
    padding: '40px 32px',
    background: t.color.bgCard,
    border: `1px dashed ${t.color.borderStrong}`,
    borderRadius: t.radius.xl,
    textAlign: 'center',
  },
  emptyIcon: {
    fontSize: 42,
    color: t.color.textFaint,
    marginBottom: 12,
    lineHeight: 1,
  },
  emptyTitle: {
    fontSize: t.font.subtitle,
    fontWeight: t.font.weight.semibold,
    color: t.color.text,
    marginBottom: 8,
  },
  emptyText: {
    color: t.color.textDim,
    fontSize: t.font.body,
    lineHeight: 1.55,
    margin: '0 0 20px 0',
  },
  emptyBtn: {
    padding: '10px 22px',
    background: t.color.accent,
    color: '#fff',
    border: 'none',
    borderRadius: t.radius.md,
    fontSize: t.font.body,
    fontWeight: t.font.weight.semibold,
    cursor: 'pointer',
    boxShadow: t.shadow.accent,
    transition: t.transition.fast,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
  },
};
