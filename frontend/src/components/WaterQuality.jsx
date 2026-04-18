import React, { useState } from 'react';

const RIVERS = [
  'Someș — Dej',
  'Mureș — Alba Iulia',
  'Olt — Rm. Vâlcea',
  'Siret — Bacău',
  'Someș — Cluj-Napoca',
];

const RIVER_DATA = {
  'Someș — Dej': {
    indicators: [
      { name: 'pH', value: 7.4, unit: '', min: 6.5, max: 9.0, goodMax: 8.0, modMax: 8.5 },
      { name: 'Oxigen dizolvat', value: 8.1, unit: 'mg/L', min: 0, max: 14, goodMin: 7, modMin: 5 },
      { name: 'Turbiditate', value: 18, unit: 'NTU', min: 0, max: 100, goodMax: 20, modMax: 50 },
      { name: 'Conductivitate', value: 385, unit: 'μS/cm', min: 0, max: 1000, goodMax: 500, modMax: 750 },
      { name: 'Hidrocarburi', value: 0.02, unit: 'mg/L', min: 0, max: 0.1, goodMax: 0.03, modMax: 0.06 },
      { name: 'Sedimente în suspensie', value: 22, unit: 'mg/L', min: 0, max: 150, goodMax: 30, modMax: 60 },
    ],
    risk: 3, incidents: 2,
  },
  'Mureș — Alba Iulia': {
    indicators: [
      { name: 'pH', value: 7.8, unit: '', min: 6.5, max: 9.0, goodMax: 8.0, modMax: 8.5 },
      { name: 'Oxigen dizolvat', value: 7.3, unit: 'mg/L', min: 0, max: 14, goodMin: 7, modMin: 5 },
      { name: 'Turbiditate', value: 35, unit: 'NTU', min: 0, max: 100, goodMax: 20, modMax: 50 },
      { name: 'Conductivitate', value: 520, unit: 'μS/cm', min: 0, max: 1000, goodMax: 500, modMax: 750 },
      { name: 'Hidrocarburi', value: 0.04, unit: 'mg/L', min: 0, max: 0.1, goodMax: 0.03, modMax: 0.06 },
      { name: 'Sedimente în suspensie', value: 58, unit: 'mg/L', min: 0, max: 150, goodMax: 30, modMax: 60 },
    ],
    risk: 6, incidents: 5,
  },
  'Olt — Rm. Vâlcea': {
    indicators: [
      { name: 'pH', value: 7.2, unit: '', min: 6.5, max: 9.0, goodMax: 8.0, modMax: 8.5 },
      { name: 'Oxigen dizolvat', value: 9.2, unit: 'mg/L', min: 0, max: 14, goodMin: 7, modMin: 5 },
      { name: 'Turbiditate', value: 12, unit: 'NTU', min: 0, max: 100, goodMax: 20, modMax: 50 },
      { name: 'Conductivitate', value: 320, unit: 'μS/cm', min: 0, max: 1000, goodMax: 500, modMax: 750 },
      { name: 'Hidrocarburi', value: 0.01, unit: 'mg/L', min: 0, max: 0.1, goodMax: 0.03, modMax: 0.06 },
      { name: 'Sedimente în suspensie', value: 15, unit: 'mg/L', min: 0, max: 150, goodMax: 30, modMax: 60 },
    ],
    risk: 2, incidents: 1,
  },
  'Siret — Bacău': {
    indicators: [
      { name: 'pH', value: 8.1, unit: '', min: 6.5, max: 9.0, goodMax: 8.0, modMax: 8.5 },
      { name: 'Oxigen dizolvat', value: 6.5, unit: 'mg/L', min: 0, max: 14, goodMin: 7, modMin: 5 },
      { name: 'Turbiditate', value: 45, unit: 'NTU', min: 0, max: 100, goodMax: 20, modMax: 50 },
      { name: 'Conductivitate', value: 580, unit: 'μS/cm', min: 0, max: 1000, goodMax: 500, modMax: 750 },
      { name: 'Hidrocarburi', value: 0.05, unit: 'mg/L', min: 0, max: 0.1, goodMax: 0.03, modMax: 0.06 },
      { name: 'Sedimente în suspensie', value: 85, unit: 'mg/L', min: 0, max: 150, goodMax: 30, modMax: 60 },
    ],
    risk: 8, incidents: 9,
  },
  'Someș — Cluj-Napoca': {
    indicators: [
      { name: 'pH', value: 7.6, unit: '', min: 6.5, max: 9.0, goodMax: 8.0, modMax: 8.5 },
      { name: 'Oxigen dizolvat', value: 7.8, unit: 'mg/L', min: 0, max: 14, goodMin: 7, modMin: 5 },
      { name: 'Turbiditate', value: 28, unit: 'NTU', min: 0, max: 100, goodMax: 20, modMax: 50 },
      { name: 'Conductivitate', value: 460, unit: 'μS/cm', min: 0, max: 1000, goodMax: 500, modMax: 750 },
      { name: 'Hidrocarburi', value: 0.03, unit: 'mg/L', min: 0, max: 0.1, goodMax: 0.03, modMax: 0.06 },
      { name: 'Sedimente în suspensie', value: 42, unit: 'mg/L', min: 0, max: 150, goodMax: 30, modMax: 60 },
    ],
    risk: 5, incidents: 4,
  },
};

function getStatus(ind) {
  // For indicators where higher is worse (pH, turbidity, conductivity, hydrocarbons, sediments)
  if (ind.goodMax != null) {
    if (ind.value <= ind.goodMax) return 'bun';
    if (ind.value <= ind.modMax) return 'moderat';
    return 'slab';
  }
  // For dissolved oxygen, higher is better
  if (ind.goodMin != null) {
    if (ind.value >= ind.goodMin) return 'bun';
    if (ind.value >= ind.modMin) return 'moderat';
    return 'slab';
  }
  return 'moderat';
}

const STATUS_COLORS = { bun: '#27ae60', moderat: '#f1c40f', slab: '#e74c3c' };
const STATUS_LABELS = { bun: 'Bun', moderat: 'Moderat', slab: 'Slab' };

function getBarPercent(ind) {
  return Math.max(0, Math.min(100, ((ind.value - ind.min) / (ind.max - ind.min)) * 100));
}

function getRiskColor(risk) {
  if (risk <= 3) return '#27ae60';
  if (risk <= 6) return '#f1c40f';
  return '#e74c3c';
}

function getRiskRecommendation(risk) {
  if (risk <= 3) return 'Calitatea apei este în parametri normali. Nu sunt necesare acțiuni suplimentare.';
  if (risk <= 6) return 'Se recomandă monitorizare suplimentară și verificarea surselor de poluare din amonte.';
  return 'Risc ridicat! Se recomandă alertarea autorităților locale și restricționarea utilizării apei pentru irigații.';
}

function getFarmerRecommendation(data) {
  const sediment = data.indicators.find(i => i.name === 'Sedimente în suspensie');
  const hydro = data.indicators.find(i => i.name === 'Hidrocarburi');
  const lines = [];
  if (sediment && getStatus(sediment) !== 'bun') {
    lines.push('Nivelul de sedimente este ridicat — se recomandă filtrarea apei înainte de irigare.');
  }
  if (hydro && getStatus(hydro) !== 'bun') {
    lines.push('Prezența hidrocarburilor depășește limita optimă — evitați irigarea culturilor sensibile.');
  }
  if (data.risk >= 7) {
    lines.push('Indicele de risc este critic — nu se recomandă utilizarea apei pentru irigații fără tratare prealabilă.');
  }
  if (lines.length === 0) {
    lines.push('Toți indicatorii relevanți pentru irigații sunt în limite acceptabile. Apa poate fi utilizată fără restricții.');
  }
  return lines;
}

export default function WaterQuality({ api, stats }) {
  const [selectedRiver, setSelectedRiver] = useState(RIVERS[0]);
  const [farmerOpen, setFarmerOpen] = useState(false);

  const data = RIVER_DATA[selectedRiver];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto', color: '#eee' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: 0, fontSize: 26, color: '#e94560' }}>
          Analiza Calității Apei
        </h2>
        <p style={{ margin: '6px 0 0', fontSize: 14, color: '#999' }}>
          Monitorizare în timp real a indicatorilor de calitate pe tronson hidrografic
        </p>
      </div>

      {/* River selector */}
      <div style={{ marginBottom: 24 }}>
        <label style={{ fontSize: 13, color: '#aaa', display: 'block', marginBottom: 6 }}>
          Selectați tronsonul hidrografic
        </label>
        <select
          value={selectedRiver}
          onChange={(e) => setSelectedRiver(e.target.value)}
          style={{
            background: '#111827',
            color: '#eee',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 15,
            cursor: 'pointer',
            minWidth: 260,
          }}
        >
          {RIVERS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      {/* Indicator cards grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: 16,
        marginBottom: 24,
      }}>
        {data.indicators.map((ind) => {
          const status = getStatus(ind);
          const color = STATUS_COLORS[status];
          const pct = getBarPercent(ind);
          return (
            <div key={ind.name} style={{
              background: '#111827',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 10,
              padding: 16,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#aaa' }}>{ind.name}</span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 10,
                  background: color + '22',
                  color: color,
                }}>
                  {STATUS_LABELS[status]}
                </span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', marginBottom: 4 }}>
                {ind.value}
                {ind.unit && (
                  <span style={{ fontSize: 13, fontWeight: 400, color: '#888', marginLeft: 4 }}>
                    {ind.unit}
                  </span>
                )}
              </div>
              {/* Bar */}
              <div style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 4,
                height: 6,
                marginTop: 8,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: color,
                  borderRadius: 4,
                  transition: 'width 0.3s',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#666', marginTop: 3 }}>
                <span>{ind.min}</span>
                <span>{ind.max}{ind.unit ? ` ${ind.unit}` : ''}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Risk report card */}
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        padding: 20,
        marginBottom: 24,
      }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 18, color: '#e94560' }}>
          Raport de Risc
        </h3>
        <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
          {/* Risk index */}
          <div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Indice de risc calculat</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{
                fontSize: 40,
                fontWeight: 700,
                color: getRiskColor(data.risk),
              }}>
                {data.risk}
              </span>
              <span style={{ fontSize: 16, color: '#666' }}>/ 10</span>
            </div>
          </div>
          {/* Incidents */}
          <div>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Frecvența incidentelor</div>
            <div style={{ fontSize: 16, color: '#ddd', marginTop: 8 }}>
              <span style={{ fontWeight: 700, color: '#fff' }}>{data.incidents}</span> incidente în ultimele 30 zile
            </div>
          </div>
          {/* Recommendation */}
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 6 }}>Recomandare</div>
            <div style={{ fontSize: 14, color: '#ccc', lineHeight: 1.5, marginTop: 4 }}>
              {getRiskRecommendation(data.risk)}
            </div>
          </div>
        </div>
      </div>

      {/* Farmer report (collapsed by default) */}
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        <button
          onClick={() => setFarmerOpen(!farmerOpen)}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            color: '#eee',
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 600 }}>
            Raport pentru Fermieri
          </span>
          <span style={{ display: 'inline-flex', color: '#888', transform: farmerOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 6 9 L 12 15 L 18 9" />
            </svg>
          </span>
        </button>
        {farmerOpen && (
          <div style={{ padding: '0 20px 20px' }}>
            <div style={{
              fontSize: 13,
              color: '#3498db',
              fontWeight: 600,
              marginBottom: 10,
            }}>
              Indicatori relevanți pentru irigații — {selectedRiver}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {getFarmerRecommendation(data).map((line, i) => (
                <li key={i} style={{ fontSize: 14, color: '#ccc', lineHeight: 1.7 }}>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
