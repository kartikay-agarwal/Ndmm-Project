# Disaster Safe Map
A full-stack demo (React frontend + Express backend) that helps users find the nearest safe shelter and routes them there during a disaster.

## Structure
- frontend/  (React app)
- backend/   (Express server that serves shelters and proxies routing requests to OpenRouteService)

## Quick start (local)
1. Clone unzip and open the project folder:
   - `cd disaster-safe-map`
2. Setup backend:
   - `cd backend`
   - Copy `.env.example` -> `.env` and set `ORS_API_KEY`
   - `npm install`
   - `npm start`
3. Setup frontend:
   - `cd ../frontend`
   - Copy `.env.example` -> `.env` (optional) 
   - `npm install`
   - `npm start`
4. Open `http://localhost:3000`

## Notes
- The backend proxies routing requests to OpenRouteService. Obtain a free API key from https://openrouteservice.org/ and set `ORS_API_KEY` in `backend/.env`.
- Do NOT commit your API key to a public repo. Use environment variables or a secrets manager.
