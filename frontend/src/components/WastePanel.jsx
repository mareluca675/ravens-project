import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

const CATEGORY_COLORS = {
  plastic: '#3498db',
  metal: '#95a5a6',
  organic: '#27ae60',
  liquid: '#e74c3c',
  construction: '#f39c12',
  background: '#7f8c8d',
};

const styles = {
  container: {
    padding: 24,
    maxWidth: 1200,
    margin: '0 auto',
  },
  heading: {
    fontSize: '1.3rem',
    fontWeight: 600,
    color: '#e94560',
    marginBottom: 20,
  },
  section: {
    background: '#16213e',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 600,
    color: '#ccc',
    marginBottom: 12,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.85rem',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    borderBottom: '2px solid #0f3460',
    color: '#e94560',
    fontWeight: 600,
  },
  td: {
    padding: '8px 12px',
    borderBottom: '1px solid #0f3460',
    color: '#ccc',
  },
  chartsRow: {
    display: 'flex',
    gap: 20,
    flexWrap: 'wrap',
  },
  chartBox: {
    flex: '1 1 400px',
    background: '#16213e',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
  },
  empty: {
    textAlign: 'center',
    padding: 60,
    color: '#777',
    fontSize: '1.1rem',
  },
};

function normalizeDetections(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    return data.features.map((f) => ({ ...f.properties, geometry: f.geometry }));
  }
  if (data.detections) return normalizeDetections(data.detections);
  if (data.results) return normalizeDetections(data.results);
  return [];
}

export default function WastePanel({ data }) {
  const detections = useMemo(() => normalizeDetections(data), [data]);

  const pieData = useMemo(() => {
    const counts = {};
    detections.forEach((d) => {
      const cat = (d.category || d.waste_type || 'unknown').toLowerCase();
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [detections]);

  const histogramData = useMemo(() => {
    const buckets = Array.from({ length: 10 }, (_, i) => ({
      range: `${(i * 10)}–${(i + 1) * 10}%`,
      count: 0,
    }));
    detections.forEach((d) => {
      const conf = d.confidence != null ? d.confidence : 0;
      const pct = conf > 1 ? conf : conf * 100;
      const idx = Math.min(Math.floor(pct / 10), 9);
      buckets[idx].count++;
    });
    return buckets;
  }, [detections]);

  if (detections.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.empty}>No data yet — click <strong style={{ color: '#e94560' }}>Generate Demo Data</strong></div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Waste Detections ({detections.length})</h2>

      {/* Table */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Recent Detections</h3>
        <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Category</th>
                <th style={styles.th}>Confidence</th>
                <th style={styles.th}>Volume</th>
                <th style={styles.th}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {detections.slice(0, 50).map((d, i) => {
                const cat = (d.category || d.waste_type || 'unknown').toLowerCase();
                const conf = d.confidence != null
                  ? `${(d.confidence > 1 ? d.confidence : d.confidence * 100).toFixed(1)}%`
                  : 'N/A';
                return (
                  <tr key={d.id || i}>
                    <td style={styles.td}>{d.id || i + 1}</td>
                    <td style={{ ...styles.td, color: CATEGORY_COLORS[cat] || '#ccc', fontWeight: 600 }}>
                      {cat}
                    </td>
                    <td style={styles.td}>{conf}</td>
                    <td style={styles.td}>{d.volume != null ? `${d.volume} m³` : '—'}</td>
                    <td style={styles.td}>
                      {d.timestamp ? new Date(d.timestamp).toLocaleString() : '—'}
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
          <h3 style={styles.sectionTitle}>Category Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((entry, idx) => (
                  <Cell key={idx} fill={CATEGORY_COLORS[entry.name] || '#7f8c8d'} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#16213e', border: '1px solid #0f3460', color: '#eee' }}
              />
              <Legend wrapperStyle={{ color: '#ccc' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div style={styles.chartBox}>
          <h3 style={styles.sectionTitle}>Confidence Distribution</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={histogramData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#0f3460" />
              <XAxis dataKey="range" tick={{ fill: '#aaa', fontSize: 11 }} angle={-30} textAnchor="end" height={50} />
              <YAxis tick={{ fill: '#aaa' }} />
              <Tooltip
                contentStyle={{ background: '#16213e', border: '1px solid #0f3460', color: '#eee' }}
              />
              <Bar dataKey="count" fill="#e94560" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
