import React, { useEffect, useMemo, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, GeoJSON, useMap } from 'react-leaflet';
import theme, { categoryColors, categoryLabels, severityColors, severityLabels, normalizeSeverity } from '../theme';
import { formatPercent, formatVolume, formatCoord, formatDateTime, formatDistance } from '../utils/format';
import { IconMap, IconPlay, IconCheck, IconArrowLeft } from './Icons';

const t = theme;

// --- Feature extraction (unchanged behavior, broader normalization) -------

function extractFeatures(data) {
  if (!data) return [];
  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) return data.features;
  if (data.type === 'Feature') return [data];
  if (Array.isArray(data)) {
    if (data.length > 0 && data[0].type === 'Feature') return data;
    return data.map((item, i) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [item.longitude || item.lon || 0, item.latitude || item.lat || 0],
      },
      properties: { ...item, _index: i },
    }));
  }
  if (data.geojson) return extractFeatures(data.geojson);
  if (data.detections) return extractFeatures(data.detections);
  if (data.incidents) return extractFeatures(data.incidents);
  return [];
}

function extractPredictionFeatures(data) {
  if (!data) return [];
  if (data.type === 'FeatureCollection' && Array.isArray(data.features)) return data.features;
  if (data.type === 'Feature') return [data];
  if (data.trajectories) return extractFeatures(data.trajectories);
  if (data.trajectory) {
    const traj = data.trajectory;
    if (traj.geojson && traj.geojson.type === 'FeatureCollection') return traj.geojson.features || [];
    if (traj.type === 'FeatureCollection') return traj.features || [];
    if (Array.isArray(traj)) return traj;
  }
  if (data.prediction_cones || data.cones) {
    const cones = data.prediction_cones || data.cones;
    if (Array.isArray(cones)) return cones;
    if (cones.type === 'FeatureCollection') return cones.features || [];
  }
  return [];
}

function getCoords(feature) {
  const geom = feature.geometry;
  if (!geom) return null;
  if (geom.type === 'Point') return [geom.coordinates[1], geom.coordinates[0]];
  if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
    const coords = geom.type === 'Polygon' ? geom.coordinates[0] : geom.coordinates[0][0];
    if (!coords || coords.length === 0) return null;
    const avgLon = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const avgLat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    return [avgLat, avgLon];
  }
  return null;
}

// Volume → marker radius (sqrt scaling for area perception)
function wasteRadius(volume) {
  const v = Number(volume || 0);
  return 5 + Math.min(11, Math.sqrt(Math.max(0, v)) * 2.4);
}

// Confidence → triangle size (14–22 px)
function dumpingSize(confidence) {
  const c = Number(confidence || 0);
  const pct = c > 1 ? c / 100 : c;
  return 14 + Math.round(pct * 8);
}

// Horizon token → opacity
function horizonOpacity(horizon) {
  const s = String(horizon || '').toLowerCase();
  if (s.includes('1h')) return 0.55;
  if (s.includes('6h')) return 0.40;
  if (s.includes('12h')) return 0.28;
  if (s.includes('24h')) return 0.18;
  return 0.35;
}

// Horizon token → display label
function horizonLabel(horizon) {
  const s = String(horizon || '').toLowerCase();
  if (s.includes('1h')) return '1 oră';
  if (s.includes('6h')) return '6 ore';
  if (s.includes('12h')) return '12 ore';
  if (s.includes('24h')) return '24 ore';
  return horizon || '—';
}

// Build a L.divIcon triangle for dumping severity
function makeTriangle(color, size) {
  const html = `
    <div style="
      width: 0; height: 0;
      border-left: ${size / 2}px solid transparent;
      border-right: ${size / 2}px solid transparent;
      border-bottom: ${size}px solid ${color};
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6));
      transform: translateY(-2px);
    "></div>`;
  return L.divIcon({
    className: 'ravens-severity-triangle',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// --- Map-internal helper components --------------------------------------

function AutoFitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (!bounds || bounds.length < 1) return;
    try {
      map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 13, duration: 1.0 });
    } catch {
      /* ignore */
    }
  }, [bounds, map]);
  return null;
}

function FlyToTarget({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target || target.lat == null || target.lon == null) return;
    const z = Math.max(map.getZoom(), 13);
    map.flyTo([target.lat, target.lon], z, { duration: 1.1 });
  }, [target, map]);
  return null;
}

// --- Popup content (styled, Romanian) -------------------------------------

function WastePopup({ props }) {
  const k = (props.category || props.waste_type || 'unknown').toString().toLowerCase();
  const color = categoryColors[k] || categoryColors.unknown;
  const confPct = props.confidence != null ? (props.confidence > 1 ? props.confidence : props.confidence * 100) : null;
  return (
    <div style={popupStyles.wrap}>
      <div style={{ ...popupStyles.header, borderLeft: `3px solid ${color}` }}>
        <div style={popupStyles.title}>{categoryLabels[k] || k}</div>
        <div style={popupStyles.sub}>Detecție deșeu</div>
      </div>
      <div style={popupStyles.body}>
        {confPct != null && <Row label="Certitudine" value={formatPercent(confPct, { raw: true, decimals: 1 })} color={color} />}
        {props.volume != null && <Row label="Volum" value={formatVolume(props.volume)} />}
        {props.id != null && <Row label="ID" value={`#${props.id}`} mono />}
        {props.timestamp && <Row label="Timp" value={formatDateTime(props.timestamp)} />}
      </div>
    </div>
  );
}

function DumpingPopup({ props }) {
  const sev = normalizeSeverity(props.severity || props.classification);
  const color = severityColors[sev];
  const confPct = props.confidence != null ? (props.confidence > 1 ? props.confidence : props.confidence * 100) : null;
  return (
    <div style={popupStyles.wrap}>
      <div style={{ ...popupStyles.header, borderLeft: `3px solid ${color}` }}>
        <div style={popupStyles.title}>Deversare detectată</div>
        <div style={{ ...popupStyles.sub, color }}>
          Severitate: <strong>{severityLabels[sev]}</strong>
        </div>
      </div>
      <div style={popupStyles.body}>
        {confPct != null && <Row label="Certitudine" value={formatPercent(confPct, { raw: true, decimals: 1 })} color={color} />}
        {props.substance_type && <Row label="Substanță" value={props.substance_type} />}
        {props.thermal_score != null && <Row label="Termic" value={formatPercent((props.thermal_score > 1 ? props.thermal_score : props.thermal_score * 100), { raw: true, decimals: 0 })} color={t.color.danger} />}
        {props.optical_score != null && <Row label="Optic" value={formatPercent((props.optical_score > 1 ? props.optical_score : props.optical_score * 100), { raw: true, decimals: 0 })} color={t.color.info} />}
        {props.lidar_score != null && <Row label="LiDAR" value={formatPercent((props.lidar_score > 1 ? props.lidar_score : props.lidar_score * 100), { raw: true, decimals: 0 })} color={t.color.success} />}
        {props.timestamp && <Row label="Timp" value={formatDateTime(props.timestamp)} />}
      </div>
    </div>
  );
}

function PredictionPopup({ props }) {
  const horizon = props.time_horizon || props.horizon || '';
  return (
    <div style={popupStyles.wrap}>
      <div style={{ ...popupStyles.header, borderLeft: `3px solid ${t.color.accent}` }}>
        <div style={popupStyles.title}>Con de predicție</div>
        <div style={popupStyles.sub}>Orizont: <strong>{horizonLabel(horizon)}</strong></div>
      </div>
      <div style={popupStyles.body}>
        {props.discharge != null && <Row label="Debit" value={`${Number(props.discharge).toFixed(1)} m³/s`} />}
        {props.uncertainty_radius_km != null && <Row label="Incertitudine" value={formatDistance(props.uncertainty_radius_km)} />}
        {props.uncertainty_radius != null && props.uncertainty_radius_km == null && (
          <Row label="Incertitudine" value={`${Number(props.uncertainty_radius).toFixed(0)} m`} />
        )}
      </div>
    </div>
  );
}

function Row({ label, value, color, mono }) {
  return (
    <div style={popupStyles.row}>
      <span style={popupStyles.rowLabel}>{label}</span>
      <span style={{ ...popupStyles.rowValue, color: color || t.color.text, fontFamily: mono ? t.font.mono : t.font.family }}>
        {value}
      </span>
    </div>
  );
}

// --- Main Map component ---------------------------------------------------

export default function Map({ wasteData, dumpingData, predictionData, mapLayers, flyToTarget, onGenerateDemo }) {
  const [visible, setVisible] = useState({
    waste: true,
    dumping: true,
    prediction: true,
    heat: false,
  });

  const wasteFeatures = useMemo(() => {
    if (mapLayers?.waste) return extractFeatures(mapLayers.waste);
    return extractFeatures(wasteData);
  }, [wasteData, mapLayers]);
  const dumpingFeatures = useMemo(() => {
    if (mapLayers?.dumping) return extractFeatures(mapLayers.dumping);
    return extractFeatures(dumpingData);
  }, [dumpingData, mapLayers]);
  const predictionFeatures = useMemo(() => extractPredictionFeatures(predictionData), [predictionData]);

  const hasData = wasteFeatures.length > 0 || dumpingFeatures.length > 0 || predictionFeatures.length > 0;

  // Compute auto-fit bounds from all visible point features.
  const bounds = useMemo(() => {
    const pts = [];
    const push = (f) => { const c = getCoords(f); if (c) pts.push(c); };
    if (visible.waste) wasteFeatures.forEach(push);
    if (visible.dumping) dumpingFeatures.forEach(push);
    if (visible.prediction) predictionFeatures.forEach(push);
    if (pts.length < 2) return null;
    return pts;
  }, [wasteFeatures, dumpingFeatures, predictionFeatures, visible]);

  // Toggle layer visibility
  const toggle = (k) => setVisible((v) => ({ ...v, [k]: !v[k] }));

  // Counts for legend badges
  const counts = {
    waste: wasteFeatures.length,
    dumping: dumpingFeatures.length,
    prediction: predictionFeatures.length,
  };

  return (
    <div style={styles.container}>
      <MapContainer
        center={[46.0, 25.0]}
        zoom={7}
        style={{ height: '100%', width: '100%', background: t.color.bg }}
        zoomControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
        />

        <AutoFitBounds bounds={bounds} />
        <FlyToTarget target={flyToTarget} />

        {/* Heat layer (rendered first so it sits under markers) */}
        {visible.heat && dumpingFeatures.map((f, idx) => {
          const pos = getCoords(f); if (!pos) return null;
          const sev = normalizeSeverity(f.properties?.severity || f.properties?.classification);
          const intensity = sev === 'HIGH' ? 0.35 : sev === 'MEDIUM' ? 0.22 : 0.12;
          return (
            <CircleMarker
              key={`heat-d-${idx}`} center={pos} radius={40}
              pathOptions={{ color: 'transparent', fillColor: severityColors[sev], fillOpacity: intensity, weight: 0 }}
              interactive={false}
            />
          );
        })}
        {visible.heat && wasteFeatures.map((f, idx) => {
          const pos = getCoords(f); if (!pos) return null;
          return (
            <CircleMarker
              key={`heat-w-${idx}`} center={pos} radius={25}
              pathOptions={{ color: 'transparent', fillColor: t.color.warning, fillOpacity: 0.13, weight: 0 }}
              interactive={false}
            />
          );
        })}

        {/* Prediction cones (below incidents & waste) */}
        {visible.prediction && predictionFeatures.map((f, idx) => {
          const props = f.properties || {};
          const opacity = horizonOpacity(props.time_horizon || props.horizon);
          const isPoly = f.geometry && (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon');
          if (isPoly) {
            return (
              <GeoJSON
                key={`pred-${idx}`}
                data={f}
                style={() => ({
                  color: t.color.accent,
                  fillColor: t.color.accent,
                  fillOpacity: opacity,
                  weight: 1.5,
                  dashArray: '2 3',
                })}
              >
                <Popup><PredictionPopup props={props} /></Popup>
              </GeoJSON>
            );
          }
          const pos = getCoords(f); if (!pos) return null;
          const r = Number(props.uncertainty_radius || 15);
          return (
            <CircleMarker
              key={`pred-${idx}`} center={pos} radius={r}
              pathOptions={{ color: t.color.accent, fillColor: t.color.accent, fillOpacity: opacity, weight: 1.5, dashArray: '2 3' }}
            >
              <Popup><PredictionPopup props={props} /></Popup>
            </CircleMarker>
          );
        })}

        {/* Waste — volume-scaled circles */}
        {visible.waste && wasteFeatures.map((f, idx) => {
          const pos = getCoords(f); if (!pos) return null;
          const props = f.properties || {};
          const k = (props.category || props.waste_type || 'unknown').toString().toLowerCase();
          const color = categoryColors[k] || categoryColors.unknown;
          return (
            <CircleMarker
              key={`waste-${idx}`}
              center={pos}
              radius={wasteRadius(props.volume)}
              pathOptions={{
                color: '#0a0e1a',
                weight: 1.5,
                fillColor: color,
                fillOpacity: 0.85,
              }}
            >
              <Popup><WastePopup props={props} /></Popup>
            </CircleMarker>
          );
        })}

        {/* Dumping incidents — severity triangle divIcons */}
        {visible.dumping && dumpingFeatures.map((f, idx) => {
          const pos = getCoords(f); if (!pos) return null;
          const props = f.properties || {};
          const sev = normalizeSeverity(props.severity || props.classification);
          const color = severityColors[sev];
          const size = dumpingSize(props.confidence);
          return (
            <Marker key={`dump-${idx}`} position={pos} icon={makeTriangle(color, size)}>
              <Popup><DumpingPopup props={props} /></Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Top-right layer toggle */}
      <div style={styles.layerToggle}>
        <div style={styles.layerToggleHeader}>Straturi</div>
        <LayerToggleRow
          active={visible.waste}
          onClick={() => toggle('waste')}
          swatch={<span style={{ ...styles.swatchCircle, background: categoryColors.plastic }} />}
          label="Detecții deșeuri"
          count={counts.waste}
        />
        <LayerToggleRow
          active={visible.dumping}
          onClick={() => toggle('dumping')}
          swatch={<Triangle color={t.color.danger} size={12} />}
          label="Deversări"
          count={counts.dumping}
        />
        <LayerToggleRow
          active={visible.prediction}
          onClick={() => toggle('prediction')}
          swatch={<span style={{ ...styles.swatchCircle, background: t.color.accent, opacity: 0.55 }} />}
          label="Predicție dispersie"
          count={counts.prediction}
        />
        <LayerToggleRow
          active={visible.heat}
          onClick={() => toggle('heat')}
          swatch={<span style={{ ...styles.swatchRing, borderColor: t.color.accent }} />}
          label="Hartă risc"
        />
      </div>

      {/* Bottom-left legend */}
      <div style={styles.legend}>
        <div style={styles.legendSection}>
          <div style={styles.legendTitle}>Categorii deșeuri</div>
          <div style={styles.legendGrid}>
            {['plastic', 'metal', 'organic', 'construction', 'liquid'].map((k) => (
              <span key={k} style={styles.legendItem}>
                <span style={{ ...styles.swatchCircle, background: categoryColors[k] }} />
                <span>{categoryLabels[k]}</span>
              </span>
            ))}
          </div>
          <div style={styles.legendSubhint}>Dimensiunea cercului ∝ volum</div>
        </div>

        <div style={styles.legendSection}>
          <div style={styles.legendTitle}>Severitate deversare</div>
          <div style={styles.legendGrid}>
            {['HIGH', 'MEDIUM', 'LOW'].map((s) => (
              <span key={s} style={styles.legendItem}>
                <Triangle color={severityColors[s]} size={13} />
                <span>{severityLabels[s]}</span>
              </span>
            ))}
          </div>
          <div style={styles.legendSubhint}>Dimensiunea triunghiului ∝ certitudine</div>
        </div>

        <div style={styles.legendSection}>
          <div style={styles.legendTitle}>Predicție dispersie</div>
          <div style={styles.legendGrid}>
            {[
              { h: '1h',  label: '1 oră',  op: 0.55 },
              { h: '6h',  label: '6 ore',  op: 0.40 },
              { h: '12h', label: '12 ore', op: 0.28 },
              { h: '24h', label: '24 ore', op: 0.18 },
            ].map(({ h, label, op }) => (
              <span key={h} style={styles.legendItem}>
                <span style={{
                  ...styles.swatchCircle,
                  background: t.color.accent,
                  opacity: op,
                  border: `1px solid ${t.color.accent}`,
                }} />
                <span>{label}</span>
              </span>
            ))}
          </div>
          <div style={styles.legendSubhint}>Opacitate ∝ probabilitate</div>
        </div>
      </div>

      {/* Empty overlay with arrow to sidebar button */}
      {!hasData && (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}><IconMap size={38} color={t.color.textFaint} /></div>
          <div style={styles.emptyTitle}>Nicio dată pe hartă</div>
          <p style={styles.emptyText}>
            Apasă <strong style={{ color: t.color.accent }}>Generează Date Demo</strong> din bara laterală
            pentru a popula harta cu detecții de deșeuri, incidente de deversare și conuri de predicție.
          </p>
          <div style={styles.emptyArrowRow}>
            <IconArrowLeft size={14} color={t.color.accent} />
            <span style={styles.emptyArrowHint}>buton în bara laterală</span>
          </div>
          {onGenerateDemo && (
            <button style={styles.emptyBtn} onClick={onGenerateDemo}>
              <IconPlay size={14} color="#fff" /> Generează Date Demo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LayerToggleRow({ active, onClick, swatch, label, count }) {
  return (
    <button style={{ ...styles.layerRow, ...(active ? styles.layerRowActive : {}) }} onClick={onClick}>
      <span style={styles.layerCheck}>
        {active ? (
          <IconCheck size={11} color={t.color.accent} strokeWidth={2.6} />
        ) : (
          <span style={styles.checkOff} />
        )}
      </span>
      <span style={styles.layerSwatchSlot}>{swatch}</span>
      <span style={styles.layerLabel}>{label}</span>
      {count != null && <span style={styles.layerCount}>{count}</span>}
    </button>
  );
}

function Triangle({ color, size }) {
  return (
    <span style={{
      display: 'inline-block',
      width: 0, height: 0,
      borderLeft: `${size / 2}px solid transparent`,
      borderRight: `${size / 2}px solid transparent`,
      borderBottom: `${size}px solid ${color}`,
    }} />
  );
}

const styles = {
  container: {
    height: 'calc(100vh - 56px)',
    width: '100%',
    position: 'relative',
    background: t.color.bg,
  },

  layerToggle: {
    position: 'absolute',
    top: 16,
    right: 16,
    background: t.color.bgCardSolid,
    backdropFilter: 'blur(12px)',
    border: `1px solid ${t.color.borderStrong}`,
    borderRadius: t.radius.xl,
    padding: 6,
    minWidth: 220,
    zIndex: 500,
    boxShadow: t.shadow.card,
  },
  layerToggleHeader: {
    fontSize: t.font.caption,
    color: t.color.textDim,
    fontWeight: t.font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '6px 10px 4px',
  },
  layerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '7px 10px',
    border: 'none',
    background: 'transparent',
    color: t.color.textMuted,
    fontSize: t.font.small,
    cursor: 'pointer',
    borderRadius: t.radius.md,
    transition: t.transition.fast,
    textAlign: 'left',
  },
  layerRowActive: {
    background: 'rgba(233, 69, 96, 0.08)',
    color: t.color.text,
  },
  layerCheck: {
    display: 'inline-flex',
    width: 16, height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.radius.sm,
    background: t.color.bgInset,
    border: `1px solid ${t.color.borderStrong}`,
    flexShrink: 0,
  },
  checkOff: {
    display: 'inline-block',
    width: 6, height: 6,
    borderRadius: 3,
    background: t.color.textFaint,
    opacity: 0.4,
  },
  layerSwatchSlot: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 18, height: 18,
    flexShrink: 0,
  },
  layerLabel: {
    flex: 1,
    fontWeight: t.font.weight.medium,
  },
  layerCount: {
    fontSize: t.font.caption,
    fontFamily: t.font.mono,
    color: t.color.textDim,
    background: t.color.bgInset,
    padding: '1px 6px',
    borderRadius: t.radius.full,
    minWidth: 20,
    textAlign: 'center',
  },

  swatchCircle: {
    display: 'inline-block',
    width: 10, height: 10,
    borderRadius: 5,
  },
  swatchRing: {
    display: 'inline-block',
    width: 12, height: 12,
    borderRadius: 6,
    border: '2px solid',
    background: 'transparent',
  },

  legend: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    background: t.color.bgCardSolid,
    backdropFilter: 'blur(12px)',
    border: `1px solid ${t.color.borderStrong}`,
    borderRadius: t.radius.xl,
    padding: '12px 14px',
    zIndex: 500,
    maxWidth: 320,
    boxShadow: t.shadow.card,
  },
  legendSection: {
    marginBottom: 10,
  },
  legendTitle: {
    fontSize: t.font.caption,
    color: t.color.textDim,
    fontWeight: t.font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: 4,
  },
  legendGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px 14px',
  },
  legendItem: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    fontSize: t.font.small,
    color: t.color.text,
  },
  legendSubhint: {
    fontSize: t.font.caption,
    color: t.color.textFaint,
    marginTop: 3,
    fontStyle: 'italic',
  },

  empty: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: t.color.bgCardSolid,
    backdropFilter: 'blur(12px)',
    border: `1px dashed ${t.color.borderStrong}`,
    borderRadius: t.radius.xl,
    padding: '28px 32px',
    color: t.color.textMuted,
    fontSize: t.font.body,
    zIndex: 600,
    textAlign: 'center',
    maxWidth: 420,
    boxShadow: t.shadow.card,
  },
  emptyIcon: {
    marginBottom: 8,
    lineHeight: 1,
    display: 'flex',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: t.font.subtitle,
    color: t.color.text,
    fontWeight: t.font.weight.semibold,
    marginBottom: 8,
  },
  emptyText: {
    color: t.color.textDim,
    fontSize: t.font.body,
    lineHeight: 1.55,
    margin: '0 0 14px 0',
  },
  emptyArrowRow: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 10px',
    background: t.color.accentBg,
    borderRadius: t.radius.full,
    border: `1px solid ${t.color.accentBorder}`,
    marginBottom: 14,
  },
  emptyArrowHint: {
    color: t.color.accent,
    fontSize: t.font.caption,
    fontWeight: t.font.weight.semibold,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  emptyBtn: {
    padding: '9px 20px',
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

const popupStyles = {
  wrap: {
    minWidth: 210,
    fontFamily: t.font.family,
  },
  header: {
    padding: '6px 10px',
    marginBottom: 8,
    background: 'rgba(233, 69, 96, 0.04)',
  },
  title: {
    fontWeight: t.font.weight.bold,
    fontSize: '0.95rem',
    color: '#e0e0e0',
    lineHeight: 1.2,
  },
  sub: {
    fontSize: t.font.caption,
    color: '#a0a8ba',
    marginTop: 2,
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    padding: '0 2px',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 10,
    fontSize: t.font.small,
  },
  rowLabel: {
    color: '#8892a4',
    fontWeight: t.font.weight.medium,
  },
  rowValue: {
    fontWeight: t.font.weight.semibold,
    textAlign: 'right',
  },
};
