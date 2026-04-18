// Number, percentage, distance, volume, and date/time formatters — Romanian locale.
// Keep every UI number consistent: 1,200,000 not 1200000; 87.3% not 87.30000001%.

const RO = 'ro-RO';

export function formatNumber(n, opts = {}) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const { decimals = 0 } = opts;
  return Number(n).toLocaleString(RO, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// percent(0.873) => "87.3%"; percent(87.3, { raw: true }) => "87.3%"
export function formatPercent(value, { decimals = 1, raw = false } = {}) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const pct = raw ? Number(value) : Number(value) * 100;
  return `${pct.toLocaleString(RO, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

// volume in m³ — pick sensible decimals based on magnitude
export function formatVolume(m3) {
  if (m3 == null || Number.isNaN(Number(m3))) return '—';
  const v = Number(m3);
  const decimals = v >= 10 ? 1 : 2;
  return `${v.toLocaleString(RO, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} m³`;
}

// distance in km (input in km) — auto-switch to metres below 1 km
export function formatDistance(km) {
  if (km == null || Number.isNaN(Number(km))) return '—';
  const v = Number(km);
  if (v < 1) return `${Math.round(v * 1000).toLocaleString(RO)} m`;
  return `${v.toLocaleString(RO, { minimumFractionDigits: 1, maximumFractionDigits: 2 })} km`;
}

// lat/lon to 4 decimals
export function formatCoord(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return '—';
  return Number(deg).toLocaleString(RO, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

// timestamp → "17 apr. 2026, 14:32"
export function formatDateTime(ts) {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString(RO, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// "acum 5 min", "acum 2h", "acum 3 zile" — useful for "recent" hints
export function formatRelative(ts) {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'acum câteva secunde';
  if (diffSec < 3600) return `acum ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `acum ${Math.floor(diffSec / 3600)} h`;
  return `acum ${Math.floor(diffSec / 86400)} zile`;
}
