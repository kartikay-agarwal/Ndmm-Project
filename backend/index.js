// backend/index.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import serverless from 'serverless-http';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const ORS_KEY = process.env.ORS_API_KEY;

// Simple in-memory shelters (replace with DB or external source in production)
const shelters = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'City Hall Shelter' }, geometry: { type: 'Point', coordinates: [77.5933, 12.9721] } },
    { type: 'Feature', properties: { name: 'Community Center' }, geometry: { type: 'Point', coordinates: [77.5980, 12.9755] } },
    { type: 'Feature', properties: { name: 'VIT Shelter' }, geometry: { type: 'Point', coordinates: [77.6000, 12.9680] } }
  ]
};

app.get('/api/shelters', (req, res) => {
  res.json(shelters);
});

// Proxy route to OpenRouteService directions API (foot-walking)
app.get('/api/route', async (req, res) => {
  if (!ORS_KEY) return res.status(500).json({ error: 'ORS_API_KEY not configured on server.' });
  const { start, end } = req.query; // start and end expected as "lon,lat"
  if (!start || !end) return res.status(400).json({ error: 'start and end required as query params' });

  try {
    const url = `https://api.openrouteservice.org/v2/directions/foot-walking?start=${start}&end=${end}`;
    const response = await fetch(url, {
      headers: { Authorization: ORS_KEY, Accept: 'application/json' }
    });
    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch route' });
  }
});

/*
  Local dev helper:
  - When running locally with `node backend/index.js` set NODE_ENV to something other
    than "production" (default when you run `node`), the server will listen so you can
    test without Vercel. On Vercel, we export the serverless handler below.
*/
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Backend running (dev) on port ${PORT}`);
  });
}

// Export serverless handler for Vercel
export default serverless(app);
