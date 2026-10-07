# SLSEA Solar Generation API

Coursework submission for **NB6007CEM — Web API Development** (NIBM / Coventry University).

A REST API serving real-time and historical solar power generation data for the
Sri Lanka Sustainable Energy Authority. It exposes a jurisdiction-scoped read path
for SLSEA analysts and an installation-scoped write path for metering devices.

## Live Deployment

- **API base:** https://solar-energy-api-3hgi.onrender.com
- **Interactive docs (Swagger):** https://solar-energy-api-3hgi.onrender.com/docs
- **OpenAPI spec:** https://solar-energy-api-3hgi.onrender.com/openapi.json

## Technology

- Node.js + Express
- PostgreSQL (via `pg`)
- JWT bearer authentication (`jsonwebtoken`)
- OpenAPI 3.0 (Swagger UI)

## Local Setup

```bash
npm install
cp .env.example .env       # then fill in DATABASE_URL and JWT_SECRET
npm run db:schema          # apply schema
npm run seed               # seed data (9 provinces, 25 districts, 225 installations, 151k readings)
npm run dev                # http://localhost:3000