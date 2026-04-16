import React, { useMemo } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker, Popup, GeoJSON, LayersControl, FeatureGroup } from 'react-leaflet';

const WASTE_COLORS = {
  plastic: '#3498db',
  metal: '#95a5a6',
  organic: '#27ae60',
  liquid: '#e74c3c',
  construction: '#f39c12',
  background: '#7f8c8d',
};

const SEVERITY_COLORS = {
  CONFIRMED: '#e74c3c',
  SUSPECTED: '#f39c12',
  NEGATIVE: '#27ae60',
};

const PREDICTION_STYLES = {
  '1h': { color: '#ff6b6b', fillOpacity: 0.7 },
  '6h': { color: '#ffa502', fillOpacity: 0.5 },
  '12h': { color: '#ff7979', fillOpacity: 0.3 },
  '24h': { color: '#badc58', fillOpacity: 0.2 },
};

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

const styles = {
  container: {
    height: 'calc(100vh - 140px)',
    width: '100%',
    position: 'relative',
  },
  noData: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 'calc(100vh - 140px)',
    color: '#777',
    fontSize: '1.1rem',
    background: '#1a1a2e',
  },
};

export default function Map({ wasteData, dumpingData, predictionData, mapLayers }) {
  const wasteFeatures = useMemo(() => extractFeatures(wasteData), [wasteData]);
  const dumpingFeatures = useMemo(() => extractFeatures(dumpingData), [dumpingData]);
  const predictionFeatures = useMemo(() => extractPredictionFeatures(predictionData), [predictionData]);

  const hasData = wasteFeatures.length > 0 || dumpingFeatures.length > 0 || predictionFeatures.length > 0;

  return (
    <div style={styles.container}>
      <MapContainer
        center={[45.9432, 24.9668]}
        zoom={7}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          subdomains="abcd"
          maxZoom={20}
        />

        <LayersControl position="topright">
          {/* Waste Detections */}
          <LayersControl.Overlay checked name="Waste Detections">
            <FeatureGroup>
              {wasteFeatures.map((feature, idx) => {
                const pos = getCoords(feature);
                if (!pos) return null;
                const props = feature.properties || {};
                const category = (props.category || props.waste_type || 'background').toLowerCase();
                const color = WASTE_COLORS[category] || WASTE_COLORS.background;
                const confidence = props.confidence != null ? (props.confidence * 100).toFixed(1) : 'N/A';

                return (
                  <CircleMarker
                    key={`waste-${idx}`}
                    center={pos}
                    radius={7}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.8, weight: 2 }}
                  >
                    <Popup>
                      <div style={{ color: '#333', fontSize: '0.85rem' }}>
                        <strong>Waste Detection</strong><br />
                        Category: <span style={{ color }}>{category}</span><br />
                        Confidence: {confidence}%<br />
                        {props.volume != null && <>Volume: {props.volume} m³<br /></>}
                        {props.timestamp && <>Time: {new Date(props.timestamp).toLocaleString()}<br /></>}
                        {props.id && <>ID: {props.id}</>}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </FeatureGroup>
          </LayersControl.Overlay>

          {/* Dumping Incidents */}
          <LayersControl.Overlay checked name="Dumping Incidents">
            <FeatureGroup>
              {dumpingFeatures.map((feature, idx) => {
                const pos = getCoords(feature);
                if (!pos) return null;
                const props = feature.properties || {};
                const severity = (props.classification || props.severity || 'SUSPECTED').toUpperCase();
                const color = SEVERITY_COLORS[severity] || SEVERITY_COLORS.SUSPECTED;
                const confidence = props.confidence != null ? (props.confidence * 100).toFixed(1) : 'N/A';

                return (
                  <CircleMarker
                    key={`dump-${idx}`}
                    center={pos}
                    radius={12}
                    pathOptions={{
                      color,
                      fillColor: color,
                      fillOpacity: 0.7,
                      weight: 3,
                    }}
                  >
                    <Popup>
                      <div style={{ color: '#333', fontSize: '0.85rem' }}>
                        <strong>Dumping Incident</strong><br />
                        Status: <span style={{ color, fontWeight: 600 }}>{severity}</span><br />
                        Confidence: {confidence}%<br />
                        {props.substance_type && <>Substance: {props.substance_type}<br /></>}
                        {props.thermal_score != null && <>Thermal: {(props.thermal_score * 100).toFixed(0)}%<br /></>}
                        {props.optical_score != null && <>Optical: {(props.optical_score * 100).toFixed(0)}%<br /></>}
                        {props.lidar_score != null && <>LiDAR: {(props.lidar_score * 100).toFixed(0)}%<br /></>}
                        {props.timestamp && <>Time: {new Date(props.timestamp).toLocaleString()}</>}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </FeatureGroup>
          </LayersControl.Overlay>

          {/* Prediction Cones */}
          <LayersControl.Overlay checked name="Prediction Cones">
            <FeatureGroup>
              {predictionFeatures.map((feature, idx) => {
                const props = feature.properties || {};
                const horizon = props.time_horizon || props.horizon || '';
                const styleKey = Object.keys(PREDICTION_STYLES).find((k) => horizon.includes(k));
                const pStyle = styleKey ? PREDICTION_STYLES[styleKey] : { color: '#ff6b6b', fillOpacity: 0.4 };

                if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                  return (
                    <GeoJSON
                      key={`pred-${idx}`}
                      data={feature}
                      style={() => ({
                        color: pStyle.color,
                        fillColor: pStyle.color,
                        fillOpacity: pStyle.fillOpacity,
                        weight: 2,
                      })}
                    />
                  );
                }

                const pos = getCoords(feature);
                if (!pos) return null;
                const radius = props.uncertainty_radius || 15;

                return (
                  <CircleMarker
                    key={`pred-${idx}`}
                    center={pos}
                    radius={radius}
                    pathOptions={{
                      color: pStyle.color,
                      fillColor: pStyle.color,
                      fillOpacity: pStyle.fillOpacity,
                      weight: 2,
                    }}
                  >
                    <Popup>
                      <div style={{ color: '#333', fontSize: '0.85rem' }}>
                        <strong>Prediction</strong><br />
                        Horizon: {horizon || 'N/A'}<br />
                        {props.discharge != null && <>Discharge: {props.discharge}<br /></>}
                        {props.uncertainty_radius != null && <>Uncertainty: {props.uncertainty_radius}m</>}
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
            </FeatureGroup>
          </LayersControl.Overlay>

          {/* Risk Heatmap */}
          <LayersControl.Overlay name="Risk Heatmap">
            <FeatureGroup>
              {dumpingFeatures.map((feature, idx) => {
                const pos = getCoords(feature);
                if (!pos) return null;
                const props = feature.properties || {};
                const severity = (props.classification || props.severity || 'SUSPECTED').toUpperCase();
                const intensity = severity === 'CONFIRMED' ? 0.35 : severity === 'SUSPECTED' ? 0.2 : 0.1;

                return (
                  <CircleMarker
                    key={`heat-${idx}`}
                    center={pos}
                    radius={35}
                    pathOptions={{
                      color: 'transparent',
                      fillColor: '#e94560',
                      fillOpacity: intensity,
                      weight: 0,
                    }}
                  />
                );
              })}
              {wasteFeatures.map((feature, idx) => {
                const pos = getCoords(feature);
                if (!pos) return null;

                return (
                  <CircleMarker
                    key={`heat-w-${idx}`}
                    center={pos}
                    radius={25}
                    pathOptions={{
                      color: 'transparent',
                      fillColor: '#f39c12',
                      fillOpacity: 0.15,
                      weight: 0,
                    }}
                  />
                );
              })}
            </FeatureGroup>
          </LayersControl.Overlay>
        </LayersControl>
      </MapContainer>

      {!hasData && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(22, 33, 62, 0.9)',
            padding: '20px 32px',
            borderRadius: 8,
            color: '#aaa',
            fontSize: '1rem',
            zIndex: 1000,
            pointerEvents: 'none',
          }}
        >
          No data yet — click <strong style={{ color: '#e94560' }}>Generate Demo Data</strong> to populate the map
        </div>
      )}
    </div>
  );
}
