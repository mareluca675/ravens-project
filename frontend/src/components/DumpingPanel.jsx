import React, { useState } from 'react';

const COLORS = {
  CONFIRMED: '#e74c3c',
  SUSPECTED: '#f39c12',
  NEGATIVE: '#27ae60',
};

const styles = {
  panel: { padding: '20px', color: '#eee' },
  filterBar: { display: 'flex', gap: '10px', marginBottom: '20px' },
  filterBtn: (active) => ({
    padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer',
    background: active ? '#e94560' : '#0f3460', color: '#eee',
    fontWeight: active ? 'bold' : 'normal',
  }),
  card: { background: '#0f3460', borderRadius: '10px', padding: '16px', marginBottom: '12px' },
  badge: (cls) => ({
    display: 'inline-block', padding: '4px 12px', borderRadius: '12px',
    fontSize: '12px', fontWeight: 'bold', color: '#fff',
    background: COLORS[cls] || '#666',
  }),
  barContainer: {
    background: '#16213e', borderRadius: '4px', height: '8px',
    marginTop: '4px', marginBottom: '8px', overflow: 'hidden',
  },
  bar: (value, color) => ({
    height: '100%', width: `${Math.round(value * 100)}%`,
    background: color, borderRadius: '4px', transition: 'width 0.3s',
  }),
  label: { fontSize: '13px', color: '#aaa', marginBottom: '2px' },
  empty: { textAlign: 'center', padding: '60px 20px', color: '#888', fontSize: '16px' },
};

export default function DumpingPanel({ data }) {
  const [filter, setFilter] = useState('All');

  if (!data || data.length === 0) {
    return <div style={styles.empty}>No data yet — click <b>Generate Demo Data</b> to start.</div>;
  }

  const filters = ['All', 'CONFIRMED', 'SUSPECTED', 'NEGATIVE'];
  const filtered = filter === 'All' ? data : data.filter(d => d.classification === filter);

  return (
    <div style={styles.panel}>
      <h2 style={{ marginTop: 0 }}>Dumping Incidents</h2>
      <div style={styles.filterBar}>
        {filters.map(f => (
          <button key={f} style={styles.filterBtn(filter === f)} onClick={() => setFilter(f)}>
            {f} {f !== 'All' ? `(${data.filter(d => d.classification === f).length})` : `(${data.length})`}
          </button>
        ))}
      </div>
      {filtered.map((inc, i) => (
        <div key={inc.id || i} style={styles.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={styles.badge(inc.classification)}>{inc.classification}</span>
            <span style={{ color: '#aaa', fontSize: '13px' }}>{inc.timestamp}</span>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Confidence:</strong> {(inc.confidence * 100).toFixed(1)}%
            {inc.substance_type && <span style={{ marginLeft: '16px' }}><strong>Substance:</strong> {inc.substance_type}</span>}
          </div>
          <div style={styles.label}>Thermal Score: {((inc.thermal_score || 0) * 100).toFixed(0)}%</div>
          <div style={styles.barContainer}><div style={styles.bar(inc.thermal_score || 0, '#e74c3c')} /></div>
          <div style={styles.label}>Optical Score: {((inc.optical_score || 0) * 100).toFixed(0)}%</div>
          <div style={styles.barContainer}><div style={styles.bar(inc.optical_score || 0, '#3498db')} /></div>
          <div style={styles.label}>LiDAR Score: {((inc.lidar_score || 0) * 100).toFixed(0)}%</div>
          <div style={styles.barContainer}><div style={styles.bar(inc.lidar_score || 0, '#2ecc71')} /></div>
          <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
            Location: {inc.latitude?.toFixed(4)}, {inc.longitude?.toFixed(4)}
          </div>
        </div>
      ))}
    </div>
  );
}
