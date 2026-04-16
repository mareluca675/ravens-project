import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const styles = {
  panel: { padding: '20px', color: '#eee' },
  card: { background: '#0f3460', borderRadius: '10px', padding: '16px', marginBottom: '16px' },
  slider: { width: '100%', accentColor: '#e94560' },
  sliderLabels: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#aaa', marginTop: '4px' },
  stat: {
    display: 'inline-block', background: '#16213e', padding: '12px 20px',
    borderRadius: '8px', marginRight: '12px', marginBottom: '8px', textAlign: 'center',
  },
  statValue: { fontSize: '20px', fontWeight: 'bold', color: '#e94560' },
  statLabel: { fontSize: '11px', color: '#aaa', marginTop: '4px' },
  empty: { textAlign: 'center', padding: '60px 20px', color: '#888', fontSize: '16px' },
};

const HOUR_MARKS = [1, 6, 12, 24];

export default function PredictionPanel({ data }) {
  const [selectedHour, setSelectedHour] = useState(1);

  if (!data) {
    return <div style={styles.empty}>No data yet — click <b>Generate Demo Data</b> to start.</div>;
  }

  const trajectory = data.trajectory || data;
  const discharge = trajectory.discharge || {};

  const dischargeData = HOUR_MARKS.map(h => ({
    hour: `${h}h`,
    uncertainty_km: (trajectory[`hour_${h}`] || {}).uncertainty_radius_km || 0,
  }));

  const currentSnapshot = trajectory[`hour_${selectedHour}`] || {};
  const centroid = currentSnapshot.centroid || [null, null];

  return (
    <div style={styles.panel}>
      <h2 style={{ marginTop: 0 }}>Trajectory Prediction</h2>

      <div style={styles.card}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Source Point</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          <div style={styles.stat}>
            <div style={styles.statValue}>{data.origin?.lat?.toFixed(4) || '—'}</div>
            <div style={styles.statLabel}>Latitude</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>{data.origin?.lon?.toFixed(4) || '—'}</div>
            <div style={styles.statLabel}>Longitude</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>{discharge.discharge_m3s?.toFixed(1) || '—'}</div>
            <div style={styles.statLabel}>Discharge (m³/s)</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>{discharge.velocity_ms?.toFixed(2) || '—'}</div>
            <div style={styles.statLabel}>Velocity (m/s)</div>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>
          Time Horizon: <span style={{ color: '#e94560' }}>{selectedHour}h</span>
        </h3>
        <input type="range" min={1} max={24} value={selectedHour}
          onChange={e => setSelectedHour(Number(e.target.value))} style={styles.slider} />
        <div style={styles.sliderLabels}>
          {HOUR_MARKS.map(h => (
            <span key={h} style={{ cursor: 'pointer', color: selectedHour === h ? '#e94560' : '#aaa' }}
              onClick={() => setSelectedHour(h)}>{h}h</span>
          ))}
        </div>
        <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap' }}>
          <div style={styles.stat}>
            <div style={styles.statValue}>{currentSnapshot.uncertainty_radius_km?.toFixed(2) || '—'}</div>
            <div style={styles.statLabel}>Uncertainty (km)</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>{centroid[0] !== null ? centroid[0].toFixed(4) : '—'}</div>
            <div style={styles.statLabel}>Centroid Lat</div>
          </div>
          <div style={styles.stat}>
            <div style={styles.statValue}>{centroid[1] !== null ? centroid[1].toFixed(4) : '—'}</div>
            <div style={styles.statLabel}>Centroid Lon</div>
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: '15px' }}>Dispersion Over Time</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={dischargeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a2e" />
            <XAxis dataKey="hour" stroke="#aaa" />
            <YAxis stroke="#aaa" />
            <Tooltip contentStyle={{ background: '#16213e', border: 'none', color: '#eee' }} />
            <Line type="monotone" dataKey="uncertainty_km" stroke="#e94560" strokeWidth={2}
              dot={{ fill: '#e94560' }} name="Uncertainty (km)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
