// src/components/LiveRoute.jsx
import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import { useLiveRoute } from '../hooks/useLiveRoute';
import L from 'leaflet';

// Small helper component to fly map to position when it updates
function FlyToPosition({ position, zoom = 15 }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !position) return;
    map.flyTo([position.latitude, position.longitude], zoom, { duration: 0.8 });
  }, [map, position, zoom]);
  return null;
}

// default marker icon sometimes broken in bundlers; to be safe we'll not use default Marker icon except for shelters (use CircleMarker instead).
// But if you want icons, you can set them up manually.

export default function LiveRoute() {
  const { position, nearest, route, shelters, status, start, stop } = useLiveRoute({ throttleMs: 4000 });
  const mapRef = useRef(null);

  // initial center fallback (if no position yet) - center of Vellore area (example)
  const defaultCenter = [12.9721, 77.5933];

  const routeCoords = route?.coords || []; // [[lat, lon], ...]

  return (
    <div style={{ display: 'flex', gap: 12, padding: 12 }}>
      <div style={{ flex: 1, minWidth: 320 }}>
        <h2>Live Route Tracker</h2>
        <p>Status: <strong>{status}</strong></p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button onClick={start}>Start Tracking</button>
          <button onClick={stop}>Stop Tracking</button>
        </div>

        <div style={{ marginBottom: 8 }}>
          <strong>Your Position:</strong>
          <div>{position ? `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` : 'No position yet'}</div>
        </div>

        <div style={{ marginBottom: 8 }}>
          <strong>Nearest Shelter:</strong>
          <div>{nearest ? `${nearest.feature.properties.name} — ${Math.round(nearest.distance)} m` : 'No nearest shelter yet'}</div>
        </div>

        <div>
          <strong>Route Info:</strong>
          <pre style={{ maxHeight: 200, overflow: 'auto', background: '#fafafa', padding: 8 }}>
            {route ? JSON.stringify({
              fromCache: route.fromCache,
              points: route.coords.length,
              distanceMeters: route.raw?.data?.features?.[0]?.properties?.summary?.distance ?? 'unknown'
            }, null, 2) : 'No route yet'}
          </pre>
        </div>
      </div>

      <div style={{ width: 640, height: 480 }}>
        <MapContainer
          center={position ? [position.latitude, position.longitude] : defaultCenter}
          zoom={13}
          style={{ width: '100%', height: '100%', borderRadius: 8 }}
          whenCreated={map => { mapRef.current = map; }}
        >
          <TileLayer
            attribution='© OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Fly map when position updates */}
          {position && <FlyToPosition position={position} zoom={16} />}

          {/* User marker */}
          {position && (
            <CircleMarker
              center={[position.latitude, position.longitude]}
              radius={8}
              pathOptions={{ color: '#1976d2', fillColor: '#1976d2', fillOpacity: 0.9 }}
            >
              <Popup>
                You: {position.latitude.toFixed(5)}, {position.longitude.toFixed(5)}
              </Popup>
            </CircleMarker>
          )}

          {/* Shelters (from shelters state or nearest) */}
          {shelters?.features?.map((feat, i) => {
            const [lon, lat] = feat.geometry.coordinates;
            const isNearest = nearest && nearest.feature === feat;
            return (
              <CircleMarker
                key={i}
                center={[lat, lon]}
                radius={isNearest ? 8 : 6}
                pathOptions={{ color: isNearest ? '#e63946' : '#2a9d8f', fillColor: isNearest ? '#e63946' : '#2a9d8f', fillOpacity: 0.9 }}
              >
                <Popup>
                  <strong>{feat.properties?.name || 'Shelter'}</strong><br />
                  {isNearest ? 'Nearest' : ''}
                </Popup>
              </CircleMarker>
            );
          })}

          {/* Route polyline */}
          {routeCoords && routeCoords.length > 0 && (
            <Polyline positions={routeCoords} pathOptions={{ color: '#1976d2', weight: 4, opacity: 0.85 }} />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
