import React, { useState, useCallback } from 'react';
import axios from 'axios';
import Map from './components/Map';
import WastePanel from './components/WastePanel';
import DumpingPanel from './components/DumpingPanel';
import PredictionPanel from './components/PredictionPanel';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const api = axios.create({ baseURL: API_BASE });

const TABS = ['Map View', 'Waste Panel', 'Dumping Panel', 'Prediction Panel'];

const styles = {
  app: {
    minHeight: '100vh',
    background: '#1a1a2e',
    color: '#eee',
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    background: '#0f3460',
    borderBottom: '2px solid #e94560',
  },
  title: {
    margin: 0,
    fontSize: '1.6rem',
    fontWeight: 700,
    letterSpacing: '0.15em',
    color: '#e94560',
  },
  subtitle: {
    fontSize: '0.75rem',
    color: '#aaa',
    marginLeft: 12,
    fontWeight: 400,
  },
  demoBtn: {
    padding: '10px 20px',
    background: '#e94560',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  demoBtnDisabled: {
    padding: '10px 20px',
    background: '#555',
    color: '#999',
    border: 'none',
    borderRadius: 6,
    cursor: 'not-allowed',
    fontWeight: 600,
    fontSize: '0.9rem',
  },
  tabBar: {
    display: 'flex',
    gap: 0,
    background: '#16213e',
    borderBottom: '1px solid #0f3460',
  },
  tab: {
    padding: '12px 24px',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: '#aaa',
    fontWeight: 500,
    fontSize: '0.95rem',
    borderBottom: '3px solid transparent',
    transition: 'all 0.2s',
  },
  tabActive: {
    padding: '12px 24px',
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: '#e94560',
    fontWeight: 600,
    fontSize: '0.95rem',
    borderBottom: '3px solid #e94560',
    transition: 'all 0.2s',
  },
  content: {
    padding: 0,
  },
  stats: {
    display: 'flex',
    gap: 16,
    padding: '12px 24px',
    background: '#16213e',
    borderBottom: '1px solid #0f3460',
  },
  statBadge: {
    padding: '4px 12px',
    background: '#0f3460',
    borderRadius: 4,
    fontSize: '0.8rem',
    color: '#ccc',
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState('Map View');
  const [wasteData, setWasteData] = useState(null);
  const [dumpingData, setDumpingData] = useState(null);
  const [predictionData, setPredictionData] = useState(null);
  const [mapLayers, setMapLayers] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerateDemo = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wasteRes, dumpingRes, predRes] = await Promise.all([
        api.post('/api/lidar/process?synthetic=true'),
        api.post('/api/dumping/detect?synthetic=true'),
        api.post('/api/prediction/trajectory?lat=46.77&lon=23.59'),
      ]);

      setWasteData(wasteRes.data);
      setDumpingData(dumpingRes.data);
      setPredictionData(predRes.data);

      const [layersRes, statsRes] = await Promise.all([
        api.get('/api/map/layers'),
        api.get('/api/stats/summary'),
      ]);

      setMapLayers(layersRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Demo generation failed:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to generate demo data');
    } finally {
      setLoading(false);
    }
  }, []);

  const renderContent = () => {
    switch (activeTab) {
      case 'Map View':
        return (
          <Map
            wasteData={wasteData}
            dumpingData={dumpingData}
            predictionData={predictionData}
            mapLayers={mapLayers}
          />
        );
      case 'Waste Panel':
        return <WastePanel data={wasteData} />;
      case 'Dumping Panel':
        return <DumpingPanel data={dumpingData} />;
      case 'Prediction Panel':
        return <PredictionPanel data={predictionData} />;
      default:
        return null;
    }
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <h1 style={styles.title}>RAVENS</h1>
          <span style={styles.subtitle}>River AI Vision for Environmental Surveillance</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {error && (
            <span style={{ color: '#e94560', fontSize: '0.85rem' }}>{error}</span>
          )}
          <button
            style={loading ? styles.demoBtnDisabled : styles.demoBtn}
            onClick={handleGenerateDemo}
            disabled={loading}
          >
            {loading ? 'Generating...' : 'Generate Demo Data'}
          </button>
        </div>
      </header>

      {stats && (
        <div style={styles.stats}>
          <span style={styles.statBadge}>Detections: {stats.waste_detections ?? 0}</span>
          <span style={styles.statBadge}>Incidents: {stats.dumping_incidents ?? 0}</span>
          <span style={styles.statBadge}>Predictions: {stats.trajectory_predictions ?? 0}</span>
        </div>
      )}

      <nav style={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            style={activeTab === tab ? styles.tabActive : styles.tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>

      <main style={styles.content}>{renderContent()}</main>
    </div>
  );
}
