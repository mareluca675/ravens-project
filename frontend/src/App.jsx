import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import theme from './theme';
import { formatNumber } from './utils/format';
import Logo from './components/Logo';
import {
  IconDashboard, IconMap, IconWaste, IconLidar, IconAlert, IconTrend,
  IconCamera, IconWater, IconChat, IconPlay, IconCheck,
} from './components/Icons';
import MapView from './components/Map';
import WastePanel from './components/WastePanel';
import DumpingPanel from './components/DumpingPanel';
import PredictionPanel from './components/PredictionPanel';
import Dashboard from './components/Dashboard';
import CivicReporting from './components/CivicReporting';
import WaterQuality from './components/WaterQuality';
import Chatbot from './components/Chatbot';
import LidarPipeline from './components/LidarPipeline';

const t = theme;
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const api = axios.create({ baseURL: API_BASE });

const NAV_ITEMS = [
  { id: 'dashboard',  label: 'Tablou de Bord',         Icon: IconDashboard },
  { id: 'map',        label: 'Harta Interactiv\u0103', Icon: IconMap },
  { id: 'waste',      label: 'Detectare De\u0219euri', Icon: IconWaste },
  { id: 'lidar',      label: 'Pipeline LiDAR',         Icon: IconLidar },
  { id: 'dumping',    label: 'Detectare Devers\u0103ri', Icon: IconAlert },
  { id: 'prediction', label: 'Predic\u021Bie Traseu',  Icon: IconTrend },
  { id: 'reporting',  label: 'Raportare Civic\u0103',  Icon: IconCamera },
  { id: 'water',      label: 'Calitatea Apei',         Icon: IconWater },
  { id: 'chatbot',    label: 'Chatbot Ecologic',       Icon: IconChat },
];

// Animated count-up from previous value to new value over ~450ms.
function useAnimatedNumber(value) {
  const [display, setDisplay] = useState(value || 0);
  const fromRef = useRef(value || 0);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = Number(value || 0);
    if (from === to) { setDisplay(to); return; }
    const start = performance.now();
    const dur = 450;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return display;
}

function StatBadge({ value, label, accent }) {
  const animated = useAnimatedNumber(value);
  return (
    <span style={{ ...styles.statBadge, borderColor: accent, color: accent }}>
      <span style={styles.statBadgeValue}>{formatNumber(animated)}</span>
      <span style={styles.statBadgeLabel}>{label}</span>
    </span>
  );
}

function DemoButton({ loading, success, collapsed, onClick }) {
  const style = loading ? styles.demoBtnLoading : (success ? styles.demoBtnSuccess : styles.demoBtn);
  const Icon = success ? IconCheck : (loading ? null : IconPlay);
  const labelFull = loading ? 'Se generează...' : (success ? 'Date generate' : 'Generează Date Demo');

  return (
    <button style={style} onClick={onClick} disabled={loading}>
      <span style={styles.demoBtnContent}>
        {loading && <span style={styles.spinner} aria-hidden />}
        {Icon && !loading && <Icon size={14} color="currentColor" />}
        {!collapsed && <span>{labelFull}</span>}
      </span>
    </button>
  );
}

export default function App() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [wasteData, setWasteData] = useState(null);
  const [dumpingData, setDumpingData] = useState(null);
  const [predictionData, setPredictionData] = useState(null);
  const [mapLayers, setMapLayers] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [demoSuccess, setDemoSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState(null);

  const handleGenerateDemo = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDemoSuccess(false);
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
      setDemoSuccess(true);
    } catch (err) {
      console.error('Demo generation failed:', err);
      setError(err.response?.data?.detail || err.message || 'Eroare la generarea datelor demo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!demoSuccess) return;
    const id = setTimeout(() => setDemoSuccess(false), 1800);
    return () => clearTimeout(id);
  }, [demoSuccess]);

  const navigateToMap = useCallback((lat, lon, id) => {
    if (lat == null || lon == null) return;
    setFlyToTarget({ lat, lon, id, ts: Date.now() });
    setActiveSection('map');
  }, []);

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return <Dashboard stats={stats} wasteData={wasteData} dumpingData={dumpingData} predictionData={predictionData} onNavigate={setActiveSection} />;
      case 'map':
        return <MapView
          wasteData={wasteData}
          dumpingData={dumpingData}
          predictionData={predictionData}
          mapLayers={mapLayers}
          flyToTarget={flyToTarget}
          onGenerateDemo={handleGenerateDemo}
        />;
      case 'waste':
        return <WastePanel data={mapLayers?.waste || wasteData} onGenerateDemo={handleGenerateDemo} />;
      case 'lidar':
        return <LidarPipeline />;
      case 'dumping':
        return <DumpingPanel
          data={mapLayers?.dumping || dumpingData}
          onGenerateDemo={handleGenerateDemo}
          onNavigateToMap={navigateToMap}
        />;
      case 'prediction':
        return <PredictionPanel data={predictionData} onGenerateDemo={handleGenerateDemo} />;
      case 'reporting':
        return <CivicReporting api={api} />;
      case 'water':
        return <WaterQuality api={api} stats={stats} />;
      case 'chatbot':
        return <Chatbot api={api} />;
      default:
        return null;
    }
  };

  const sw = sidebarCollapsed ? 64 : 240;
  const activeItem = NAV_ITEMS.find((n) => n.id === activeSection);
  const ActiveIcon = activeItem?.Icon;

  return (
    <div style={styles.app}>
      <style>{`
        @keyframes ravens-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes ravens-fadein { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {/* Sidebar */}
      <nav style={{ ...styles.sidebar, width: sw }}>
        <div style={styles.logoArea} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
          <Logo size={36} />
          {!sidebarCollapsed && <span style={styles.logoText}>RAVENS</span>}
        </div>

        <div style={styles.navList}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.Icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                style={isActive ? { ...styles.navItem, ...styles.navItemActive } : styles.navItem}
                onClick={() => setActiveSection(item.id)}
                title={item.label}
              >
                <span style={styles.navIcon}>
                  <Icon size={18} color="currentColor" strokeWidth={1.8} />
                </span>
                {!sidebarCollapsed && <span style={styles.navLabel}>{item.label}</span>}
              </button>
            );
          })}
        </div>

        <div style={styles.sidebarFooter}>
          <DemoButton
            loading={loading}
            success={demoSuccess}
            collapsed={sidebarCollapsed}
            onClick={handleGenerateDemo}
          />
        </div>
      </nav>

      {/* Main content */}
      <div style={{ ...styles.main, marginLeft: sw }}>
        <header style={styles.topBar}>
          <div style={styles.topBarLeft}>
            <h2 style={styles.pageTitle}>
              {ActiveIcon && (
                <span style={styles.pageTitleIcon}>
                  <ActiveIcon size={18} color={t.color.accent} strokeWidth={1.8} />
                </span>
              )}
              <span style={styles.pageTitleText}>{activeItem?.label}</span>
            </h2>
          </div>
          <div style={styles.topBarRight}>
            {error && <span style={styles.errorBadge}>{error}</span>}
            {stats && (
              <>
                <StatBadge value={stats.waste_detections ?? 0} label="detecții"  accent={t.color.accent} />
                <StatBadge value={stats.dumping_incidents ?? 0} label="incidente" accent={t.color.danger} />
                <StatBadge value={stats.trajectory_predictions ?? 0} label="predicții" accent={t.color.info} />
              </>
            )}
          </div>
        </header>

        <main style={styles.content}>
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

const styles = {
  app: {
    display: 'flex',
    minHeight: '100vh',
    background: t.color.bg,
    color: t.color.text,
    fontFamily: t.font.family,
  },

  sidebar: {
    position: 'fixed',
    top: 0, left: 0,
    height: '100vh',
    background: 'linear-gradient(180deg, #0f1629 0%, #0a0e1a 100%)',
    borderRight: `1px solid ${t.color.accentBg}`,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 100,
    transition: 'width 0.25s ease',
    overflow: 'hidden',
  },
  logoArea: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '16px 14px',
    cursor: 'pointer',
    borderBottom: `1px solid ${t.color.border}`,
    minHeight: 64,
  },
  logoText: {
    fontWeight: 800,
    fontSize: '1.25rem',
    letterSpacing: '0.18em',
    color: t.color.accent,
    whiteSpace: 'nowrap',
  },

  navList: {
    flex: 1,
    padding: '12px 8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    overflowY: 'auto',
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    border: '1px solid transparent',
    background: 'transparent',
    color: t.color.textDim,
    fontSize: t.font.body,
    fontWeight: t.font.weight.medium,
    borderRadius: t.radius.lg,
    cursor: 'pointer',
    textAlign: 'left',
    whiteSpace: 'nowrap',
    transition: t.transition.fast,
    minHeight: 40,
    width: '100%',
    boxSizing: 'border-box',
  },
  navItemActive: {
    color: t.color.accent,
    fontWeight: t.font.weight.semibold,
    background: t.color.accentBg,
    border: `1px solid ${t.color.accentBorder}`,
  },
  navIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 18,
    flexShrink: 0,
  },
  navLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  sidebarFooter: {
    padding: '16px 12px',
    borderTop: `1px solid ${t.color.border}`,
  },
  demoBtn: {
    width: '100%',
    padding: '11px 0',
    background: `linear-gradient(135deg, ${t.color.accent}, ${t.color.accentDim})`,
    color: '#fff',
    border: 'none',
    borderRadius: t.radius.lg,
    cursor: 'pointer',
    fontWeight: t.font.weight.semibold,
    fontSize: t.font.body,
    transition: t.transition.normal,
    boxShadow: t.shadow.accent,
  },
  demoBtnLoading: {
    width: '100%',
    padding: '11px 0',
    background: t.color.bgElevated,
    color: t.color.textMuted,
    border: `1px solid ${t.color.borderStrong}`,
    borderRadius: t.radius.lg,
    cursor: 'not-allowed',
    fontWeight: t.font.weight.semibold,
    fontSize: t.font.body,
  },
  demoBtnSuccess: {
    width: '100%',
    padding: '11px 0',
    background: t.color.successBg,
    color: t.color.success,
    border: `1px solid ${t.color.successBorder}`,
    borderRadius: t.radius.lg,
    cursor: 'default',
    fontWeight: t.font.weight.semibold,
    fontSize: t.font.body,
    transition: t.transition.normal,
  },
  demoBtnContent: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  spinner: {
    display: 'inline-block',
    width: 13, height: 13,
    border: `2px solid ${t.color.borderStrong}`,
    borderTopColor: t.color.accent,
    borderRadius: '50%',
    animation: 'ravens-spin 0.7s linear infinite',
  },

  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    minHeight: '100vh',
    transition: 'margin-left 0.25s ease',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px',
    height: 56,
    background: 'rgba(15,22,41,0.7)',
    backdropFilter: 'blur(12px)',
    borderBottom: `1px solid ${t.color.border}`,
    position: 'sticky',
    top: 0,
    zIndex: 50,
  },
  topBarLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  topBarRight: { display: 'flex', alignItems: 'center', gap: 10 },
  pageTitle: {
    margin: 0,
    fontSize: t.font.subtitle,
    fontWeight: t.font.weight.semibold,
    color: t.color.text,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  pageTitleIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22, height: 22,
  },
  pageTitleText: {
    animation: 'ravens-fadein 0.25s ease',
  },

  statBadge: {
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 6,
    padding: '4px 12px',
    background: 'rgba(233,69,96,0.08)',
    border: '1px solid',
    borderRadius: t.radius.md,
    whiteSpace: 'nowrap',
    transition: t.transition.fast,
  },
  statBadgeValue: {
    fontSize: t.font.body,
    fontWeight: t.font.weight.bold,
    fontFamily: t.font.mono,
    lineHeight: 1,
  },
  statBadgeLabel: {
    fontSize: t.font.caption,
    fontWeight: t.font.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    opacity: 0.8,
  },

  errorBadge: {
    padding: '4px 12px',
    background: t.color.dangerBg,
    border: `1px solid ${t.color.dangerBorder}`,
    borderRadius: t.radius.md,
    fontSize: t.font.small,
    color: t.color.danger,
    fontWeight: t.font.weight.medium,
  },

  content: { flex: 1 },
};
