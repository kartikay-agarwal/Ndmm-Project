// backend/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import NodeCache from 'node-cache';
import serverless from 'serverless-http';

dotenv.config();

const app = express();

// --- Ensure fetch exists (Node <18 fallback) ---
// If global fetch is missing (older node), dynamically import node-fetch.
// We avoid throwing if install missing — it's in package.json below.
if (!globalThis.fetch) {
  try {
    const { default: fetch } = await import('node-fetch');
    globalThis.fetch = fetch;
  } catch (e) {
    console.warn('node-fetch not available; ensure running Node 18+ or install node-fetch.');
  }
}

// --- Basic middleware ---
app.use(helmet());
app.use(express.json());

// CORS: prefer explicit origin via env var. If not configured and in dev, allow all.
const CORS_ORIGIN = process.env.CORS_ORIGIN || (process.env.NODE_ENV !== 'production' ? '*' : undefined);
app.use(cors(CORS_ORIGIN ? { origin: CORS_ORIGIN } : {}));

// Logging in dev
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// --- Config ---
const PORT = process.env.PORT || 5000;
const ORS_KEY = process.env.ORS_API_KEY;
const ROUTE_CACHE_TTL_SECONDS = Number(process.env.ROUTE_CACHE_TTL_SECONDS) || 30; // seconds

// --- Simple in-memory shelters (replace with DB in production) ---
const shelters = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'City Hall Shelter' }, geometry: { type: 'Point', coordinates: [77.5933, 12.9721] } },
    { type: 'Feature', properties: { name: 'Community Center' }, geometry: { type: 'Point', coordinates: [77.5980, 12.9755] } },
    { type: 'Feature', properties: { name: 'VIT Shelter' }, geometry: { type: 'Point', coordinates: [77.6000, 12.9680] } }
  ]
};

// --- Cache for ORS responses ---
const routeCache = new NodeCache({ stdTTL: ROUTE_CACHE_TTL_SECONDS, checkperiod: 60 });

// --- Helpers ---
function isValidLonLatPair(pair) {
  // expected "lon,lat" where lon and lat parse to floats and are in valid ranges
  if (!pair || typeof pair !== 'string') return false;
  const parts = pair.split(',').map(p => p.trim());
  if (parts.length !== 2) return false;
  const lon = Number(parts[0]);
  const lat = Number(parts[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return false;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return false;
  return true;
}

// --- Rate limiter for /api/route to prevent abuse ---
const routeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // max 60 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false
});

// --- Routes ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', env: process.env.NODE_ENV || 'development' });
});

app.get('/api/shelters', (req, res) => {
  res.json(shelters);
});

// Optional dev-only: allow adding shelters (REMOVE or protect for prod)
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/shelters', (req, res) => {
    const { name, lon, lat } = req.body || {};
    if (!name || !Number.isFinite(lon) || !Number.isFinite(lat)) {
      return res.status(400).json({ error: 'name, lon, lat required (lon and lat must be numbers)' });
    }
    shelters.features.push({
      type: 'Feature',
      properties: { name },
      geometry: { type: 'Point', coordinates: [Number(lon), Number(lat)] }
    });
    res.status(201).json({ message: 'shelter added', shelters });
  });
}

/*
  Proxy route to OpenRouteService directions API (foot-walking)
  - start and end expected as "lon,lat" (ORS expects lon,lat)
  - caches responses briefly to reduce ORS usage
*/
app.get('/api/route', routeLimiter, async (req, res) => {
  if (!ORS_KEY) return res.status(500).json({ error: 'ORS_API_KEY not configured on server.' });

  const { start, end } = req.query; // expected "lon,lat"
  if (!start || !end) return res.status(400).json({ error: 'start and end required as query params in "lon,lat" format' });
  if (!isValidLonLatPair(start) || !isValidLonLatPair(end)) {
    return res.status(400).json({ error: 'start and end must be valid lon,lat pairs (numbers). Example: start=77.5933,12.9721' });
  }

  const cacheKey = `${start}|${end}`;
  const cached = routeCache.get(cacheKey);
  if (cached) {
    return res.json({ fromCache: true, data: cached });
  }

  try {
    const url = `https://api.openrouteservice.org/v2/directions/foot-walking?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;

    const response = await fetch(url, {
      headers: { Authorization: ORS_KEY, Accept: 'application/json' }
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('ORS error', response.status, text);
      return res.status(response.status).json({ error: 'OpenRouteService error', details: text });
    }

    const data = await response.json();

    // Cache and return
    routeCache.set(cacheKey, data);
    res.json({ fromCache: false, data });
  } catch (err) {
    console.error('Failed to fetch route:', err);
    res.status(500).json({ error: 'Failed to fetch route', details: err.message || String(err) });
  }
});

// --- Local dev helper: run server when not in production ---
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Backend running (dev) on port ${PORT}`);
  });
}

// Export serverless handler for platforms like Vercel
export default serverless(app);
