import React, { useMemo, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import theme, { categoryColors, categoryLabels } from '../theme';
import { formatNumber, formatPercent, formatVolume, formatDateTime } from '../utils/format';
import { IconBan, IconPlay } from './Icons';

const t = theme;

// Color for a confidence value (0..1 or 0..100)
function confBand(confPct) {
  if (confPct >= 85) return t.color.success;
  if (confPct >= 70) return t.color.warning;
  return t.color.danger;
}
function confPctOf(d) {
  if (d.confidence == null) return 0;
  const c = Number(d.confidence);
  return c > 1 ? c : c * 100;
}

function normalizeDetections(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return data.features.map((f) => ({ ...f.properties, geometry: f.geometry }));
  }
  if (data.geojson) return normalizeDetections(data.geojson);
  if (data.detections) return normalizeDetections(data.detections);
  if (data.results) return normalizeDetections(data.results);
  return [];
}

function catKey(d) { return String(d.category || d.waste_type || 'unknown').toLowerCase(); }
function catLabel(k) { return categoryLabels[k] || (k.charAt(0).toUpperCase() + k.slice(1)); }
function catColor(k) { return categoryColors[k] || categoryColors.unknown; }

// Custom pie tooltip — count + percentage
function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const total = p.payload?._total || 1;
  const pct = (p.value / total) * 100;
  return (
    <div style={styles.tooltip}>
      <div style={{ color: p.payload.fill, fontWeight: 600, marginBottom: 2 }}>{p.payload.label}</div>
      <div>{formatNumber(p.value)} detecții · {formatPercent(pct, { raw: true })}</div>
    </div>
  );
}

function BarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={styles.tooltip}>
      <div style={{ fontWeight: 600, marginBottom: 2 }}>{p.range}</div>
      <div>{formatNumber(p.count)} detecții</div>
    </div>
  );
}

const SORT_OPTIONS = [
  { key: 'id',         label: 'ID' },
  { key: 'category',   label: 'Categorie' },
  { key: 'confidence', label: 'Certitudine' },
  { key: 'volume',     label: 'Volum' },
  { key: 'timestamp',  label: 'Timp' },
];

function cmp(a, b, key) {
  if (key === 'category') return String(a.category || '').localeCompare(String(b.category || ''));
  if (key === 'confidence') return confPctOf(a) - confPctOf(b);
  if (key === 'volume') return Number(a.volume || 0) - Number(b.volume || 0);
  if (key === 'timestamp') return new Date(a.timestamp || 0) - new Date(b.timestamp || 0);
  // id or numeric fallback
  return Number(a.id || 0) - Number(b.id || 0);
}

export default function WastePanel({ data, onGenerateDemo }) {
  const detections = useMemo(() => normalizeDetections(data), [data]);
  const [sort, setSort] = useState({ key: 'confidence', dir: 'desc' });

  const sorted = useMemo(() => {
    const arr = [...detections];
    arr.sort((a, b) => {
      const r = cmp(a, b, sort.key);
      return sort.dir === 'asc' ? r : -r;
    });
    return arr;
  }, [detections, sort]);

  const stats = useMemo(() => {
    if (detections.length === 0) return null;
    const total = detections.length;
    const avgConf = detections.reduce((s, d) => s + confPctOf(d), 0) / total;
    const totalVol = detections.reduce((s, d) => s + Number(d.volume || 0), 0);
    const counts = {};
    detections.forEach((d) => { const k = catKey(d); counts[k] = (counts[k] || 0) + 1; });
    const topKey = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    return { total, avgConf, totalVol, topKey, topCount: counts[topKey] };
  }, [detections]);

  const pieData = useMemo(() => {
    if (detections.length === 0) return [];
    const counts = {};
    detections.forEach((d) => { const k = catKey(d); counts[k] = (counts[k] || 0) + 1; });
    const total = detections.length;
    return Object.entries(counts).map(([k, v]) => ({
      key: k, label: catLabel(k), value: v, fill: catColor(k), _total: total,
    }));
  }, [detections]);

  const histogramData = useMemo(() => {
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      range: `${i * 10}–${(i + 1) * 10}`,
      mid: i * 10 + 5,
      count: 0,
    }));
    detections.forEach((d) => {
      const pct = confPctOf(d);
      const idx = Math.min(Math.floor(pct / 10), 9);
      buckets[idx].count++;
    });
    return buckets;
  }, [detections]);

  if (detections.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyCard}>
          <div style={styles.emptyIcon}><IconBan size={42} color={t.color.textFaint} /></div>
          <div style={styles.emptyTitle}>Nicio detecție disponibilă</div>
          <p style={styles.emptyText}>
            Pentru a vedea aici detecțiile de deșeuri, generează un set de date demo.
            Vei primi ~15–20 de detecții clasificate (plastic, metal, organic, construcții, substanță lichidă).
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

  const toggleSort = (key) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Detecții Deșeuri</h2>
      <p style={styles.sub}>
        Obiecte detectate și clasificate din norul LiDAR, cu scoruri de certitudine și volum estimat.
      </p>

      {/* Summary metric cards */}
      <div style={styles.metricRow}>
        <MetricCard label="Total detecții"    value={formatNumber(stats.total)} accent={t.color.accent} />
        <MetricCard label="Certitudine medie" value={formatPercent(stats.avgConf, { raw: true, decimals: 1 })} accent={t.color.success} />
        <MetricCard label="Volum total"       value={formatVolume(stats.totalVol)} accent={t.color.warning} />
        <MetricCard label="Categorie dominantă"
                    value={catLabel(stats.topKey)}
                    hint={`${formatNumber(stats.topCount)} obiecte`}
                    accent={catColor(stats.topKey)} />
      </div>

      {/* Table */}
      <div style={styles.section}>
        <div style={styles.sectionHead}>
          <span style={styles.sectionTitle}>Detecții recente</span>
          <span style={styles.sectionHint}>Click pe antet pentru sortare</span>
        </div>
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                {SORT_OPTIONS.map((c) => (
                  <th
                    key={c.key}
                    style={styles.th}
                    onClick={() => toggleSort(c.key)}
                  >
                    <span style={styles.thInner}>
                      {c.label}
                      <SortArrow
                        active={sort.key === c.key}
                        dir={sort.key === c.key ? sort.dir : null}
                      />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 100).map((d, i) => {
                const k = catKey(d);
                const pct = confPctOf(d);
                const bandColor = confBand(pct);
                return (
                  <tr key={d.id || i} style={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                    <td style={styles.td}>{d.id || i + 1}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.pill, background: catColor(k), color: '#0a0a1a' }}>
                        {catLabel(k)}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={styles.confWrap}>
                        <div style={styles.confTrack}>
                          <div style={{ ...styles.confFill, width: `${Math.min(100, pct)}%`, background: bandColor }} />
                        </div>
                        <span style={{ ...styles.confLabel, color: bandColor }}>
                          {formatPercent(pct, { raw: true, decimals: 1 })}
                        </span>
                      </div>
                    </td>
                    <td style={{ ...styles.td, ...styles.numCell }}>
                      {d.volume != null ? formatVolume(d.volume) : '—'}
                    </td>
                    <td style={styles.td}>
                      {d.timestamp ? formatDateTime(d.timestamp) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts */}
      <div style={styles.chartsRow}>
        <div style={styles.chartBox}>
          <div style={styles.sectionHead}>
            <span style={styles.sectionTitle}>Distribuție pe categorii</span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="label"
                   cx="50%" cy="50%" outerRadius={95} innerRadius={40}
                   paddingAngle={2} stroke="none">
                {pieData.map((entry) => (
                  <Cell key={entry.key} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div style={styles.pieLegend}>
            {pieData.map((p) => (
              <div key={p.key} style={styles.pieLegendItem}>
                <span style={{ ...styles.pieLegendSwatch, background: p.fill }} />
                <span style={styles.pieLegendLabel}>{p.label}</span>
                <span style={styles.pieLegendValue}>{formatNumber(p.value)}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={styles.chartBox}>
          <div style={styles.sectionHead}>
            <span style={styles.sectionTitle}>Distribuție certitudine</span>
            <span style={styles.sectionHint}>
              <span style={{ ...styles.dot, background: t.color.danger }} /> &lt;70%
              <span style={{ ...styles.dot, background: t.color.warning, marginLeft: 10 }} /> 70–85%
              <span style={{ ...styles.dot, background: t.color.success, marginLeft: 10 }} /> ≥85%
            </span>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={histogramData} margin={{ top: 10, right: 12, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="range"
                     tick={{ fill: t.color.textDim, fontSize: 11 }}
                     label={{ value: 'Certitudine (%)', position: 'insideBottom', dy: 16, fill: t.color.textDim, fontSize: 12 }} />
              <YAxis tick={{ fill: t.color.textDim, fontSize: 11 }} allowDecimals={false}
                     label={{ value: 'Detecții', angle: -90, position: 'insideLeft', fill: t.color.textDim, fontSize: 12 }} />
              <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {histogramData.map((b, i) => (
                  <Cell key={i} fill={confBand(b.mid)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, hint, accent }) {
  return (
    <div style={styles.metricCard}>
      <div style={{ ...styles.metricValue, color: accent }}>{value}</div>
      <div style={styles.metricLabel}>{label}</div>
      {hint && <div style={styles.metricHint}>{hint}</div>}
    </div>
  );
}

// Small chevron pair that dims the inactive arrow — active dir highlights up or down.
function SortArrow({ active, dir }) {
  const on = t.color.accent;
  const off = t.color.textFaint;
  const upColor  = active && dir === 'asc'  ? on : off;
  const dnColor  = active && dir === 'desc' ? on : off;
  const opacity  = active ? 1 : 0.4;
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', marginLeft: 2, opacity }}>
      <svg width="8" height="5" viewBox="0 0 8 5" style={{ display: 'block' }}>
        <path d="M 0 5 L 4 0 L 8 5 Z" fill={upColor} />
      </svg>
      <svg width="8" height="5" viewBox="0 0 8 5" style={{ display: 'block', marginTop: 1 }}>
        <path d="M 0 0 L 4 5 L 8 0 Z" fill={dnColor} />
      </svg>
    </span>
  );
}

const styles = {
  container: {
    padding: '28px 32px 40px',
    minHeight: 'calc(100vh - 56px)',
    background: t.color.bg,
    color: t.color.text,
  },
  heading: {
    margin: 0,
    fontSize: t.font.h2,
    fontWeight: t.font.weight.bold,
    color: t.color.text,
  },
  sub: {
    margin: '6px 0 20px 0',
    color: t.color.textDim,
    fontSize: t.font.body,
    maxWidth: 760,
    lineHeight: 1.5,
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
    transition: t.transition.fast,
  },
  metricValue: {
    fontSize: t.font.metricMd,
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
  section: {
    background: t.color.bgCard,
    borderRadius: t.radius.xl,
    padding: 20,
    marginBottom: 20,
    border: `1px solid ${t.color.border}`,
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
    display: 'inline-flex',
    alignItems: 'center',
  },
  dot: {
    display: 'inline-block',
    width: 8, height: 8, borderRadius: 4, marginRight: 5,
    verticalAlign: 'middle',
  },
  tableWrap: {
    overflowX: 'auto',
    maxHeight: 440,
    overflowY: 'auto',
    borderRadius: t.radius.md,
  },
  table: {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: 0,
    fontSize: t.font.body,
  },
  th: {
    position: 'sticky',
    top: 0,
    textAlign: 'left',
    padding: '10px 14px',
    background: t.color.bgInset,
    borderBottom: `1px solid ${t.color.borderStrong}`,
    color: t.color.textDim,
    fontWeight: t.font.weight.semibold,
    fontSize: t.font.caption,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    userSelect: 'none',
    transition: t.transition.fast,
  },
  thInner: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  td: {
    padding: '11px 14px',
    borderBottom: `1px solid ${t.color.border}`,
    color: t.color.text,
    verticalAlign: 'middle',
  },
  numCell: { textAlign: 'right', fontFamily: t.font.mono, fontSize: t.font.body },
  trEven: { background: 'transparent' },
  trOdd:  { background: 'rgba(255,255,255,0.02)' },
  pill: {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: t.radius.full,
    fontSize: t.font.caption,
    fontWeight: t.font.weight.semibold,
    letterSpacing: '0.02em',
  },
  confWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    minWidth: 160,
  },
  confTrack: {
    flex: 1,
    height: 6,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 3,
    overflow: 'hidden',
    minWidth: 80,
  },
  confFill: {
    height: '100%',
    transition: 'width 0.25s ease',
    borderRadius: 3,
  },
  confLabel: {
    fontFamily: t.font.mono,
    fontSize: t.font.caption,
    fontWeight: t.font.weight.semibold,
    minWidth: 50,
    textAlign: 'right',
  },

  chartsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
    gap: 20,
  },
  chartBox: {
    background: t.color.bgCard,
    border: `1px solid ${t.color.border}`,
    borderRadius: t.radius.xl,
    padding: 20,
  },

  pieLegend: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTop: `1px solid ${t.color.border}`,
  },
  pieLegendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 6px',
    fontSize: t.font.caption,
  },
  pieLegendSwatch: {
    width: 10, height: 10, borderRadius: 2, flexShrink: 0,
  },
  pieLegendLabel: { color: t.color.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pieLegendValue: { color: t.color.textDim, fontFamily: t.font.mono, fontWeight: t.font.weight.semibold },

  tooltip: {
    background: t.color.bgCardSolid,
    border: `1px solid ${t.color.borderStrong}`,
    borderRadius: t.radius.md,
    padding: '8px 12px',
    fontSize: t.font.small,
    color: t.color.text,
    boxShadow: t.shadow.md,
  },

  // Empty state
  emptyCard: {
    maxWidth: 520,
    margin: '80px auto',
    padding: '36px 32px',
    textAlign: 'center',
    background: t.color.bgCard,
    border: `1px solid ${t.color.border}`,
    borderRadius: t.radius.xl,
  },
  emptyIcon: {
    fontSize: '2.6rem',
    color: t.color.accent,
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: t.font.title,
    fontWeight: t.font.weight.bold,
    color: t.color.text,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: t.font.body,
    color: t.color.textDim,
    lineHeight: 1.6,
    margin: '0 0 22px 0',
  },
  emptyBtn: {
    padding: '12px 22px',
    background: `linear-gradient(135deg, ${t.color.accent}, ${t.color.accentDim})`,
    color: '#fff',
    border: 'none',
    borderRadius: t.radius.lg,
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
