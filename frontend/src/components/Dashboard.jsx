import React, { useState } from 'react';

const MODULES = [
  {
    id: 'waste',
    icon: '\u2B22',
    title: 'Procesare LiDAR',
    desc: 'Detectare \u0219i clasificare automat\u0103 a de\u0219eurilor din nori de puncte 3D',
  },
  {
    id: 'dumping',
    icon: '\u26A0',
    title: 'Detectare Devers\u0103ri',
    desc: 'Fuziune multi-senzorial\u0103: termic, optic, LiDAR',
  },
  {
    id: 'prediction',
    icon: '\u2248',
    title: 'Predic\u021Bie Traseu',
    desc: 'Model advec\u021Bie-difuzie + LSTM pentru predic\u021Bia dispersiei',
  },
  {
    id: 'map',
    icon: '\u25C9',
    title: 'Hart\u0103 Interactiv\u0103',
    desc: 'Vizualizare GeoJSON cu straturi tematice comutabile',
  },
  {
    id: 'reporting',
    icon: '\u2691',
    title: 'Raportare Civic\u0103',
    desc: 'Validare automat\u0103 AI a sesiz\u0103rilor cet\u0103\u021Benilor',
  },
  {
    id: 'water',
    icon: '\u2234',
    title: 'Calitatea Apei',
    desc: 'Analiz\u0103 localizat\u0103 pe tronson hidrografic',
  },
  {
    id: 'chatbot',
    icon: '\u2767',
    title: 'Chatbot Ecologic',
    desc: 'Asistent AI specializat \u00een ecologie \u0219i legisla\u021Bie de mediu',
  },
];

const TECH_BADGES = [
  'Python', 'FastAPI', 'PyTorch', 'React', 'Leaflet.js', 'SQLAlchemy', 'NumPy/SciPy',
];

export default function Dashboard({ stats, wasteData, dumpingData, predictionData, onNavigate }) {
  const [hoveredModule, setHoveredModule] = useState(null);

  const wasteCount = stats?.waste_detections ?? null;
  const dumpingCount = stats?.dumping_incidents ?? null;
  const predCount = stats?.trajectory_predictions ?? null;

  let riskScore = 'N/A';
  if (stats?.average_risk_score != null) {
    riskScore = stats.average_risk_score.toFixed(1);
  } else if (stats?.risk_scores && stats.risk_scores.length > 0) {
    const avg = stats.risk_scores.reduce((a, b) => a + b, 0) / stats.risk_scores.length;
    riskScore = avg.toFixed(1);
  }

  const statCards = [
    { label: 'Total detec\u021Bii de\u0219euri', value: wasteCount ?? '\u2014' },
    { label: 'Incidente devers\u0103ri', value: dumpingCount ?? '\u2014' },
    { label: 'Predic\u021Bii traseu', value: predCount ?? '\u2014' },
    { label: 'Scor risc mediu', value: stats ? riskScore : '\u2014' },
  ];

  return (
    <div style={s.container}>
      {/* Hero */}
      <div style={s.hero}>
        <h1 style={s.heroTitle}>RAVENS</h1>
        <p style={s.heroSub}>
          River AI Vision for Environmental Surveillance
        </p>
        <p style={s.heroDesc}>
          Sistem inteligent de monitorizare a poluării fluviale prin fuziune
          multi-senzorială și inteligență artificială
        </p>
      </div>

      {/* Stat cards */}
      <div style={s.statsRow}>
        {statCards.map((card, i) => (
          <div key={i} style={s.statCard}>
            <span style={s.statValue}>{card.value}</span>
            <span style={s.statLabel}>{card.label}</span>
          </div>
        ))}
      </div>

      {!stats && (
        <p style={s.noDataMsg}>
          Nu există date încă. Utilizați butonul "Generează Date Demo" din bara laterală pentru a popula tabloul de bord.
        </p>
      )}

      {/* Module grid */}
      <h2 style={s.sectionTitle}>Module Disponibile</h2>
      <div style={s.moduleGrid}>
        {MODULES.map((mod) => {
          const isHovered = hoveredModule === mod.id;
          return (
            <button
              key={mod.id}
              style={{
                ...s.moduleCard,
                ...(isHovered ? s.moduleCardHover : {}),
              }}
              onClick={() => onNavigate(mod.id)}
              onMouseEnter={() => setHoveredModule(mod.id)}
              onMouseLeave={() => setHoveredModule(null)}
            >
              <span style={s.moduleIcon}>{mod.icon}</span>
              <span style={s.moduleTitle}>{mod.title}</span>
              <span style={s.moduleDesc}>{mod.desc}</span>
            </button>
          );
        })}
      </div>

      {/* Tech badges */}
      <h2 style={s.sectionTitle}>Tehnologii Utilizate</h2>
      <div style={s.techRow}>
        {TECH_BADGES.map((t) => (
          <span key={t} style={s.techBadge}>{t}</span>
        ))}
      </div>
    </div>
  );
}

const s = {
  container: {
    padding: 28,
    maxWidth: 1100,
    margin: '0 auto',
  },

  /* Hero */
  hero: {
    textAlign: 'center',
    padding: '36px 20px 28px',
    marginBottom: 28,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  heroTitle: {
    margin: 0,
    fontSize: '2.6rem',
    fontWeight: 800,
    letterSpacing: '0.2em',
    color: '#e94560',
  },
  heroSub: {
    margin: '6px 0 0',
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#6b7a90',
    letterSpacing: '0.06em',
  },
  heroDesc: {
    margin: '14px auto 0',
    maxWidth: 560,
    fontSize: '0.95rem',
    lineHeight: 1.6,
    color: '#aab4c4',
  },

  /* Stat cards */
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16,
    marginBottom: 12,
  },
  statCard: {
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: '22px 18px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  statValue: {
    fontSize: '1.8rem',
    fontWeight: 700,
    color: '#e94560',
  },
  statLabel: {
    fontSize: '0.78rem',
    color: '#8892a4',
    textAlign: 'center',
  },

  noDataMsg: {
    textAlign: 'center',
    color: '#6b7a90',
    fontSize: '0.85rem',
    margin: '8px 0 24px',
  },

  /* Section heading */
  sectionTitle: {
    fontSize: '1.05rem',
    fontWeight: 600,
    color: '#cfd8e8',
    margin: '28px 0 14px',
  },

  /* Module cards */
  moduleGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: 14,
  },
  moduleCard: {
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: '22px 18px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    cursor: 'pointer',
    textAlign: 'left',
    color: 'inherit',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    transition: 'border-color 0.2s, background 0.2s',
  },
  moduleCardHover: {
    borderColor: 'rgba(233,69,96,0.35)',
    background: '#151c2e',
  },
  moduleIcon: {
    fontSize: '1.5rem',
    color: '#e94560',
    lineHeight: 1,
  },
  moduleTitle: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#e0e6f0',
  },
  moduleDesc: {
    fontSize: '0.78rem',
    color: '#7a8599',
    lineHeight: 1.45,
  },

  /* Tech badges */
  techRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  techBadge: {
    padding: '6px 16px',
    background: 'rgba(233,69,96,0.08)',
    border: '1px solid rgba(233,69,96,0.18)',
    borderRadius: 20,
    fontSize: '0.8rem',
    fontWeight: 500,
    color: '#e94560',
  },
};
