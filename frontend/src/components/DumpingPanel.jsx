import React, { useMemo, useState } from 'react';
import theme, { severityColors, severityLabels, normalizeSeverity } from '../theme';
import { formatNumber, formatPercent, formatDateTime, formatCoord, formatRelative } from '../utils/format';
import { IconBan, IconPlay, IconPin } from './Icons';

const t = theme;

// Canonical substance display labels (Romanian).
// Any incoming english/alternate token is mapped here before display/filtering.
const SUBSTANCE_ALIAS = {
  hidrocarbon: 'Hidrocarbon',
  hydrocarbon: 'Hidrocarbon',
  hidrocarburi: 'Hidrocarbon',
  oil: 'Hidrocarbon',
  petrol: 'Hidrocarbon',
  foam: 'Spumă',
  spuma: 'Spumă',
  'spumă': 'Spumă',
  sediment: 'Sediment',
  'sediment-crescut': 'Sediment',
  chemical: 'Chimic',
  chimic: 'Chimic',
  chimice: 'Chimic',
};
const SUBSTANCE_OPTIONS = ['Hidrocarbon', 'Spumă', 'Sediment', 'Chimic'];

function substanceLabel(raw) {
  if (!raw) return null;
  const key = String(raw).toLowerCase();
  return SUBSTANCE_ALIAS[key] || raw;
}

function normalizeIncidents(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  // GeoJSON FeatureCollection → flatten features with coords extracted to lat/lon
  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return data.features.map((f) => {
      const coords = f.geometry?.coordinates || [];
      return {
        ...(f.properties || {}),
        latitude: f.properties?.latitude ?? coords[1],
        longitude: f.properties?.longitude ?? coords[0],
      };
    });
  }
  if (data.geojson) return normalizeIncidents(data.geojson);
  if (data.incidents) return normalizeIncidents(data.incidents);
  // Single incident shape from POST /api/dumping/detect
  if (data.incident_id != null || data.classification || data.severity) {
    const evidence = data.evidence || {};
    return [{
      id: data.incident_id || data.id,
      classification: data.classification,
      severity: data.severity,
      confidence: data.confidence,
      thermal_score: data.thermal_score ?? evidence.thermal_score,
      optical_score: data.optical_score ?? evidence.optical_score,
      lidar_score: data.lidar_score ?? evidence.lidar_score,
      substance_type: data.substance_type ?? evidence.substance_type,
      latitude: data.latitude,
      longitude: data.longitude,
      timestamp: data.timestamp,
    }];
  }
  return [];
}

function severityOf(inc) { return normalizeSeverity(inc.severity || inc.classification); }
function confPctOf(inc) {
  const c = Number(inc.confidence || 0);
  return c > 1 ? c : c * 100;
}
function scorePct(v) {
  const n = Number(v || 0);
  return n > 1 ? n : n * 100;
}

const SEVERITY_ORDER = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const SORT_OPTIONS = [
  { key: 'recent',     label: 'Cele mai recente' },
  { key: 'confidence', label: 'Certitudine mare' },
  { key: 'severity',   label: 'Severitate' },
];

export default function DumpingPanel({ data, onGenerateDemo, onNavigateToMap }) {
  const incidents = useMemo(() => normalizeIncidents(data), [data]);

  const [sevFilter, setSevFilter] = useState('All');
  const [subFilter, setSubFilter] = useState('All');
  const [sort, setSort] = useState('recent');

  const stats = useMemo(() => {
    if (incidents.length === 0) return null;
    const total = incidents.length;
    const highCount = incidents.filter((i) => severityOf(i) === 'HIGH').length;
    const avgConf = incidents.reduce((s, i) => s + confPctOf(i), 0) / total;
    const subCounts = {};
    incidents.forEach((i) => {
      const s = substanceLabel(i.substance_type);
      if (s) subCounts[s] = (subCounts[s] || 0) + 1;
    });
    const topSub = Object.entries(subCounts).sort((a, b) => b[1] - a[1])[0];
    return { total, highCount, avgConf, topSub: topSub ? topSub[0] : null, topSubCount: topSub ? topSub[1] : 0 };
  }, [incidents]);

  const filtered = useMemo(() => {
    let arr = incidents;
    if (sevFilter !== 'All') arr = arr.filter((i) => severityOf(i) === sevFilter);
    if (subFilter !== 'All') arr = arr.filter((i) => substanceLabel(i.substance_type) === subFilter);
    arr = [...arr].sort((a, b) => {
      if (sort === 'confidence') return confPctOf(b) - confPctOf(a);
      if (sort === 'severity') return SEVERITY_ORDER[severityOf(b)] - SEVERITY_ORDER[severityOf(a)];
      // recent
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    });
    return arr;
  }, [incidents, sevFilter, subFilter, sort]);

  const sevCounts = useMemo(() => {
    const c = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    incidents.forEach((i) => { c[severityOf(i)] = (c[severityOf(i)] || 0) + 1; });
    return c;
  }, [incidents]);

  if (incidents.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyCard}>
          <div style={styles.emptyIcon}><IconBan size={42} color={t.color.textFaint} /></div>
          <div style={styles.emptyTitle}>Nicio deversare detectată</div>
          <p style={styles.emptyText}>
            Pentru a vedea aici incidentele de deversare, generează un set de date demo.
            Vei primi incidente clasificate după severitate (RIDICATĂ / MEDIE / SCĂZUTĂ),
            cu scoruri termice, optice și LiDAR.
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
      <h2 style={styles.heading}>Incidente Deversări</h2>
      <p style={styles.sub}>
        Deversări detectate prin fuziunea semnalelor termice, optice și LiDAR. Fiecare incident este clasificat
        după severitate și însoțit de scoruri de evidență.
      </p>

      {/* Summary metric cards */}
      <div style={styles.metricRow}>
        <MetricCard label="Total incidente" value={formatNumber(stats.total)} accent={t.color.accent} />
        <MetricCard
          label="Severitate RIDICATĂ"
          value={formatNumber(stats.highCount)}
          hint={stats.total ? `din ${formatNumber(stats.total)} (${formatPercent((stats.highCount / stats.total) * 100, { raw: true, decimals: 0 })})` : null}
          accent={t.color.danger}
        />
        <MetricCard
          label="Certitudine medie"
          value={formatPercent(stats.avgConf, { raw: true, decimals: 1 })}
          accent={t.color.success}
        />
        <MetricCard
          label="Substanță dominantă"
          value={stats.topSub || '—'}
          hint={stats.topSub ? `${formatNumber(stats.topSubCount)} cazuri` : 'Neidentificat'}
          accent={t.color.warning}
        />
      </div>

      {/* Filter bar */}
      <div style={styles.filterBar}>
        <FilterGroup label="Severitate">
          <FilterChip active={sevFilter === 'All'} onClick={() => setSevFilter('All')}>
            Toate <span style={styles.chipCount}>{stats.total}</span>
          </FilterChip>
          {['HIGH', 'MEDIUM', 'LOW'].map((s) => (
            <FilterChip
              key={s}
              active={sevFilter === s}
              onClick={() => setSevFilter(s)}
              accent={severityColors[s]}
            >
              {severityLabels[s]} <span style={styles.chipCount}>{sevCounts[s] || 0}</span>
            </FilterChip>
          ))}
        </FilterGroup>

        <FilterGroup label="Substanță">
          <FilterChip active={subFilter === 'All'} onClick={() => setSubFilter('All')}>Toate</FilterChip>
          {SUBSTANCE_OPTIONS.map((s) => (
            <FilterChip key={s} active={subFilter === s} onClick={() => setSubFilter(s)}>{s}</FilterChip>
          ))}
        </FilterGroup>

        <FilterGroup label="Sortează">
          <select value={sort} onChange={(e) => setSort(e.target.value)} style={styles.select}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </FilterGroup>
      </div>

      <div style={styles.resultHint}>
        Se afișează {formatNumber(filtered.length)} din {formatNumber(stats.total)} incidente
        {sevFilter !== 'All' && <> · severitate <strong>{severityLabels[sevFilter]}</strong></>}
        {subFilter !== 'All' && <> · substanță <strong>{subFilter}</strong></>}
      </div>

      {/* Cards list */}
      {filtered.length === 0 ? (
        <div style={styles.noMatch}>
          Niciun incident nu corespunde filtrelor curente.
          <button style={styles.resetBtn} onClick={() => { setSevFilter('All'); setSubFilter('All'); }}>
            Resetează filtre
          </button>
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {filtered.map((inc, i) => (
            <IncidentCard
              key={inc.id || i}
              incident={inc}
              onViewOnMap={onNavigateToMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentCard({ incident, onViewOnMap }) {
  const sev = severityOf(incident);
  const sevColor = severityColors[sev];
  const confPct = confPctOf(incident);
  const substance = substanceLabel(incident.substance_type);

  return (
    <div style={{ ...styles.card, borderLeft: `4px solid ${sevColor}` }}>
      {/* Severity badge top-right */}
      <div style={{ ...styles.sevBadge, background: sevColor }}>
        {severityLabels[sev]}
      </div>

      {/* Overall confidence — prominent at top */}
      <div style={styles.confBlock}>
        <div style={styles.confValue}>{formatPercent(confPct, { raw: true, decimals: 1 })}</div>
        <div style={styles.confLabel}>Certitudine generală</div>
      </div>

      {/* Meta row */}
      <div style={styles.metaRow}>
        {substance && (
          <div style={styles.metaItem}>
            <span style={styles.metaLabel}>Substanță</span>
            <span style={styles.metaValue}>{substance}</span>
          </div>
        )}
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Locație</span>
          <span style={styles.metaValueMono}>
            {formatCoord(incident.latitude)}, {formatCoord(incident.longitude)}
          </span>
        </div>
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Detectat</span>
          <span style={styles.metaValue}>
            {incident.timestamp ? formatRelative(incident.timestamp) : '—'}
          </span>
        </div>
      </div>

      {/* Evidence bars */}
      <div style={styles.evidence}>
        <EvidenceBar label="Termic"  value={scorePct(incident.thermal_score)} color={t.color.danger}  />
        <EvidenceBar label="Optic"   value={scorePct(incident.optical_score)} color={t.color.info}    />
        <EvidenceBar label="LiDAR"   value={scorePct(incident.lidar_score)}   color={t.color.success} />
      </div>

      {/* Action */}
      {onViewOnMap && incident.latitude != null && incident.longitude != null && (
        <button
          style={styles.mapBtn}
          onClick={() => onViewOnMap(incident.latitude, incident.longitude, incident.id)}
        >
          <IconPin size={14} /> Vezi pe hartă
        </button>
      )}
    </div>
  );
}

function EvidenceBar({ label, value, color }) {
  return (
    <div style={styles.evRow}>
      <div style={styles.evHead}>
        <span style={styles.evLabel}>{label}</span>
        <span style={{ ...styles.evValue, color }}>
          {formatPercent(value, { raw: true, decimals: 0 })}
        </span>
      </div>
      <div style={styles.evTrack}>
        <div style={{ ...styles.evFill, width: `${Math.min(100, Math.max(0, value))}%`, background: color }} />
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

function FilterGroup({ label, children }) {
  return (
    <div style={styles.filterGroup}>
      <span style={styles.filterGroupLabel}>{label}</span>
      <div style={styles.filterGroupChips}>{children}</div>
    </div>
  );
}

function FilterChip({ active, accent, onClick, children }) {
  const bg = active ? (accent || t.color.accent) : 'transparent';
  const color = active ? '#0a0a1a' : t.color.textMuted;
  const border = active
    ? (accent || t.color.accent)
    : t.color.borderStrong;
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.chip,
        background: bg,
        color,
        borderColor: border,
        fontWeight: active ? t.font.weight.semibold : t.font.weight.medium,
      }}
    >
      {children}
    </button>
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

  filterBar: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 20,
    padding: '14px 16px',
    background: t.color.bgCard,
    border: `1px solid ${t.color.border}`,
    borderRadius: t.radius.xl,
    marginBottom: 12,
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  filterGroupLabel: {
    fontSize: t.font.caption,
    color: t.color.textDim,
    fontWeight: t.font.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  filterGroupChips: {
    display: 'flex',
    gap: 6,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  chip: {
    padding: '6px 12px',
    borderRadius: t.radius.full,
    border: '1px solid',
    fontSize: t.font.small,
    cursor: 'pointer',
    transition: t.transition.fast,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  },
  chipCount: {
    display: 'inline-block',
    minWidth: 20,
    padding: '0 6px',
    borderRadius: t.radius.full,
    background: 'rgba(0, 0, 0, 0.25)',
    fontSize: t.font.caption,
    textAlign: 'center',
    lineHeight: '18px',
  },
  select: {
    padding: '7px 12px',
    borderRadius: t.radius.md,
    border: `1px solid ${t.color.borderStrong}`,
    background: t.color.bgInset,
    color: t.color.text,
    fontSize: t.font.small,
    fontFamily: t.font.family,
    cursor: 'pointer',
    outline: 'none',
  },

  resultHint: {
    color: t.color.textDim,
    fontSize: t.font.small,
    margin: '4px 2px 14px',
  },

  noMatch: {
    padding: '28px 20px',
    textAlign: 'center',
    color: t.color.textDim,
    background: t.color.bgCard,
    borderRadius: t.radius.xl,
    border: `1px dashed ${t.color.borderStrong}`,
  },
  resetBtn: {
    marginLeft: 12,
    padding: '6px 14px',
    background: t.color.accentBg,
    color: t.color.accent,
    border: `1px solid ${t.color.accentBorder}`,
    borderRadius: t.radius.md,
    cursor: 'pointer',
    fontSize: t.font.small,
    fontWeight: t.font.weight.medium,
  },

  cardGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: 14,
  },
  card: {
    position: 'relative',
    padding: '18px 20px 16px',
    background: t.color.bgCard,
    border: `1px solid ${t.color.border}`,
    borderRadius: t.radius.xl,
    transition: t.transition.fast,
  },
  sevBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: '4px 10px',
    borderRadius: t.radius.full,
    color: '#0a0a1a',
    fontSize: t.font.caption,
    fontWeight: t.font.weight.bold,
    letterSpacing: '0.05em',
  },
  confBlock: {
    marginBottom: 14,
  },
  confValue: {
    fontSize: t.font.metricLg,
    fontWeight: t.font.weight.bold,
    color: t.color.text,
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
  },
  confLabel: {
    fontSize: t.font.caption,
    color: t.color.textDim,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginTop: 2,
    fontWeight: t.font.weight.medium,
  },

  metaRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
    gap: 10,
    padding: '12px 0',
    borderTop: `1px solid ${t.color.border}`,
    borderBottom: `1px solid ${t.color.border}`,
    marginBottom: 14,
  },
  metaItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    minWidth: 0,
  },
  metaLabel: {
    fontSize: t.font.caption,
    color: t.color.textDim,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    fontWeight: t.font.weight.medium,
  },
  metaValue: {
    fontSize: t.font.small,
    color: t.color.text,
    fontWeight: t.font.weight.medium,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  metaValueMono: {
    fontSize: t.font.small,
    color: t.color.text,
    fontFamily: t.font.mono,
    fontWeight: t.font.weight.medium,
  },

  evidence: {
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
    marginBottom: 14,
  },
  evRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  evHead: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  evLabel: {
    fontSize: t.font.small,
    color: t.color.textMuted,
    fontWeight: t.font.weight.medium,
  },
  evValue: {
    fontSize: t.font.small,
    fontFamily: t.font.mono,
    fontWeight: t.font.weight.semibold,
  },
  evTrack: {
    height: 6,
    background: t.color.bgInset,
    borderRadius: 3,
    overflow: 'hidden',
  },
  evFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'width 0.35s ease',
  },

  mapBtn: {
    width: '100%',
    padding: '9px 14px',
    background: t.color.accentBg,
    color: t.color.accent,
    border: `1px solid ${t.color.accentBorder}`,
    borderRadius: t.radius.md,
    fontSize: t.font.small,
    fontWeight: t.font.weight.semibold,
    cursor: 'pointer',
    transition: t.transition.fast,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
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
