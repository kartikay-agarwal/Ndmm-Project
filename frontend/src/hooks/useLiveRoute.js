// src/hooks/useLiveRoute.js
import { useEffect, useRef, useState, useCallback } from 'react';

const API_BASE = ''; // leave empty for same-origin; or set process.env.REACT_APP_API_BASE

function distanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function useLiveRoute({ throttleMs = 5000 } = {}) {
  const [position, setPosition] = useState(null); // { latitude, longitude }
  const [nearest, setNearest] = useState(null); // { feature, distance }
  const [route, setRoute] = useState(null); // { raw, coords: [[lat,lon], ...], fromCache }
  const [shelters, setShelters] = useState(null); // geojson
  const [status, setStatus] = useState('idle');

  const watchIdRef = useRef(null);
  const lastReqRef = useRef(0);

  // load shelters once
  const fetchShelters = useCallback(async () => {
    const res = await fetch(`${API_BASE}/api/shelters`);
    if (!res.ok) throw new Error('Failed to load shelters');
    return res.json();
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchShelters()
      .then(data => { if (mounted) setShelters(data); })
      .catch(err => {
        console.error('Failed to fetch shelters', err);
        if (mounted) setShelters({ type: 'FeatureCollection', features: [] });
      });
    return () => { mounted = false; };
  }, [fetchShelters]);

  const computeNearest = useCallback((lat, lon, geojson) => {
    if (!geojson || !geojson.features || geojson.features.length === 0) return null;
    let best = null;
    for (const feat of geojson.features) {
      const [lonS, latS] = feat.geometry.coordinates;
      const d = distanceMeters(lat, lon, latS, lonS);
      if (!best || d < best.distance) best = { feature: feat, distance: d };
    }
    return best;
  }, []);

  const convertOrsToLeafletCoords = useCallback((orsData) => {
    // ORS returns features[0].geometry.coordinates as [[lon,lat], ...]
    try {
      const coords = orsData?.features?.[0]?.geometry?.coordinates;
      if (!coords || !Array.isArray(coords)) return [];
      return coords.map(([lon, lat]) => [lat, lon]);
    } catch (err) {
      return [];
    }
  }, []);

  const requestRoute = useCallback(async (lat, lon, latS, lonS) => {
    const now = Date.now();
    if (now - lastReqRef.current < throttleMs) return null; // throttle
    lastReqRef.current = now;

    setStatus('requesting-route');
    const start = `${lon},${lat}`;
    const end = `${lonS},${latS}`;
    const res = await fetch(`${API_BASE}/api/route?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
    const json = await res.json();
    if (!res.ok) {
      const err = new Error(json?.error || 'Route fetch failed');
      err.details = json;
      throw err;
    }
    const coords = convertOrsToLeafletCoords(json.data || json); // some versions nest under data
    const out = { raw: json, coords, fromCache: !!json.fromCache };
    setRoute(out);
    setStatus('route-ready');
    return out;
  }, [throttleMs, convertOrsToLeafletCoords]);

  // start watching
  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('geolocation-not-supported');
      return;
    }
    setStatus('requesting-permission');
    watchIdRef.current = navigator.geolocation.watchPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      setPosition({ latitude, longitude });
      try {
        // compute nearest using cached shelters or fetch if missing
        const geo = shelters || await fetchShelters();
        const n = computeNearest(latitude, longitude, geo);
        setNearest(n);
        if (n) {
          const [lonS, latS] = n.feature.geometry.coordinates;
          await requestRoute(latitude, longitude, latS, lonS);
        }
      } catch (err) {
        console.error(err);
        setStatus('error: ' + (err.message || String(err)));
      }
    }, (err) => {
      console.error('geolocation error', err);
      setStatus('geolocation-error: ' + err.message);
    }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 });
  }, [computeNearest, fetchShelters, requestRoute, shelters]);

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setStatus('stopped');
  }, []);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  return {
    position,
    nearest,
    route,
    shelters,
    status,
    start,
    stop
  };
}
