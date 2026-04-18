import React, { useState, useRef } from 'react';

const MOCK_REPORTS = [
  {
    id: 1,
    date: '2026-04-14',
    location: 'Sector 3, București',
    confidence: 0.91,
    status: 'confirmed',
    description: 'Depozit ilegal de deșeuri lângă râul Dâmbovița',
  },
  {
    id: 2,
    date: '2026-04-12',
    location: 'Florești, Cluj',
    confidence: 0.68,
    status: 'unconfirmed',
    description: 'Deversare suspectă în pârâul Someșul Mic',
  },
  {
    id: 3,
    date: '2026-04-10',
    location: 'Galați',
    confidence: 0.87,
    status: 'confirmed',
    description: 'Poluare industrială vizibilă pe malul Dunării',
  },
  {
    id: 4,
    date: '2026-04-08',
    location: 'Timișoara',
    confidence: 0.72,
    status: 'unconfirmed',
    description: 'Spumă suspectă pe suprafața canalului Bega',
  },
];

const styles = {
  container: {
    padding: 24,
    maxWidth: 1000,
    margin: '0 auto',
  },
  heading: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#e94560',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: '0.9rem',
    color: '#9ca3af',
    marginBottom: 28,
    lineHeight: 1.5,
  },
  card: {
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: '1.1rem',
    fontWeight: 600,
    color: '#e94560',
    marginBottom: 16,
  },
  dropZone: {
    border: '2px dashed rgba(255,255,255,0.15)',
    borderRadius: 10,
    padding: 40,
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'border-color 0.2s',
  },
  dropZoneHover: {
    borderColor: '#e94560',
  },
  dropIcon: {
    fontSize: '2.5rem',
    marginBottom: 8,
  },
  dropText: {
    color: '#9ca3af',
    fontSize: '0.9rem',
  },
  preview: {
    maxWidth: '100%',
    maxHeight: 300,
    borderRadius: 8,
    marginTop: 16,
    display: 'block',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
  fieldRow: {
    display: 'flex',
    gap: 16,
    marginBottom: 8,
  },
  fieldGroup: {
    flex: 1,
  },
  label: {
    display: 'block',
    fontSize: '0.8rem',
    color: '#9ca3af',
    marginBottom: 6,
    fontWeight: 500,
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: '#1f2937',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#e5e7eb',
    fontSize: '0.85rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
  note: {
    fontSize: '0.75rem',
    color: '#6b7280',
    marginTop: 6,
  },
  submitBtn: {
    background: '#e94560',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '12px 32px',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    marginTop: 8,
    transition: 'opacity 0.2s',
  },
  submitBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  processingText: {
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: '0.95rem',
    padding: 24,
  },
  resultCard: {
    background: '#111827',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 24,
    marginBottom: 20,
    textAlign: 'center',
  },
  badgeConfirmed: {
    display: 'inline-block',
    background: 'rgba(16,185,129,0.15)',
    color: '#10b981',
    fontWeight: 700,
    fontSize: '1rem',
    padding: '6px 18px',
    borderRadius: 6,
    marginBottom: 12,
  },
  badgeUnconfirmed: {
    display: 'inline-block',
    background: 'rgba(245,158,11,0.15)',
    color: '#f59e0b',
    fontWeight: 700,
    fontSize: '1rem',
    padding: '6px 18px',
    borderRadius: 6,
    marginBottom: 12,
  },
  confidenceText: {
    color: '#d1d5db',
    fontSize: '0.9rem',
    marginBottom: 12,
  },
  resultMessage: {
    color: '#9ca3af',
    fontSize: '0.85rem',
    lineHeight: 1.6,
  },
  reportRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  reportInfo: {
    flex: 1,
  },
  reportDesc: {
    color: '#e5e7eb',
    fontSize: '0.85rem',
    marginBottom: 4,
  },
  reportMeta: {
    color: '#6b7280',
    fontSize: '0.75rem',
  },
  statusConfirmed: {
    color: '#10b981',
    fontSize: '0.75rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    marginLeft: 12,
  },
  statusUnconfirmed: {
    color: '#f59e0b',
    fontSize: '0.75rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    marginLeft: 12,
  },
};

export default function CivicReporting({ api }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleFile = (f) => {
    if (!f || !f.type.startsWith('image/')) return;
    setFile(f);
    setResult(null);
    const url = URL.createObjectURL(f);
    setPreviewUrl(url);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    handleFile(f);
  };

  const handleSubmit = () => {
    if (!file || loading) return;
    setLoading(true);
    setResult(null);

    // Simulate AI analysis - replace with real API call when backend is ready
    setTimeout(() => {
      const confidence = +(0.6 + Math.random() * 0.35).toFixed(2);
      const confirmed = confidence >= 0.75;
      setResult({ confidence, confirmed });
      setLoading(false);
    }, 2000);
  };

  const handleReset = () => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setLatitude('');
    setLongitude('');
    setResult(null);
    setLoading(false);
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Raportare Civică</h2>
      <p style={styles.subtitle}>
        Trimite o fotografie a unei zone poluate pentru validare automată prin
        inteligență artificială
      </p>

      {/* Upload area */}
      <div style={styles.card}>
        <div
          style={styles.dropZone}
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleFile(e.target.files[0])}
          />
          {previewUrl ? (
            <img src={previewUrl} alt="Previzualizare" style={styles.preview} />
          ) : (
            <>
              <div style={styles.dropIcon}>{'\uD83D\uDCF7'}</div>
              <div style={styles.dropText}>
                Trage o fotografie aici sau click pentru a selecta
              </div>
            </>
          )}
        </div>
      </div>

      {/* Location fields */}
      <div style={styles.card}>
        <div style={styles.fieldRow}>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Latitudine</label>
            <input
              style={styles.input}
              type="text"
              placeholder="ex: 44.4268"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
            />
          </div>
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Longitudine</label>
            <input
              style={styles.input}
              type="text"
              placeholder="ex: 26.1025"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
            />
          </div>
        </div>
        <div style={styles.note}>
          Opțional — locația va fi extrasă automat din metadatele fotografiei
        </div>
      </div>

      {/* Submit button */}
      <button
        style={{
          ...styles.submitBtn,
          ...(!file || loading ? styles.submitBtnDisabled : {}),
        }}
        onClick={handleSubmit}
        disabled={!file || loading}
      >
        {loading ? 'Se procesează...' : 'Trimite Raportul'}
      </button>

      {/* Processing state */}
      {loading && (
        <div style={{ ...styles.card, marginTop: 20 }}>
          <div style={styles.processingText}>Se analizează imaginea...</div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ ...styles.resultCard, marginTop: 20 }}>
          <div
            style={
              result.confirmed
                ? styles.badgeConfirmed
                : styles.badgeUnconfirmed
            }
          >
            {result.confirmed ? 'POLUARE CONFIRMATĂ' : 'NECONFIRMAT'}
          </div>
          <div style={styles.confidenceText}>
            Scor de certitudine: <strong>{result.confidence}</strong>
          </div>
          <div style={styles.resultMessage}>
            {result.confirmed
              ? 'Sesizarea a fost înregistrată în baza de date și va fi vizibilă inspectorilor de mediu.'
              : 'Scorul de certitudine este sub pragul de 0.75. Vă rugăm să încercați o altă fotografie.'}
          </div>
          <button
            style={{
              ...styles.submitBtn,
              marginTop: 16,
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
            onClick={handleReset}
          >
            Raport nou
          </button>
        </div>
      )}

      {/* Recent reports */}
      <div style={{ ...styles.card, marginTop: 20 }}>
        <div style={styles.sectionTitle}>Sesizări Recente</div>
        {MOCK_REPORTS.map((r) => (
          <div key={r.id} style={styles.reportRow}>
            <div style={styles.reportInfo}>
              <div style={styles.reportDesc}>{r.description}</div>
              <div style={styles.reportMeta}>
                {r.date} &middot; {r.location} &middot; Certitudine: {r.confidence}
              </div>
            </div>
            <div
              style={
                r.status === 'confirmed'
                  ? styles.statusConfirmed
                  : styles.statusUnconfirmed
              }
            >
              {r.status === 'confirmed' ? 'Confirmat' : 'Neconfirmat'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
