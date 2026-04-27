# Backend Scaffold

This folder is a backend scaffold for the enhanced HCAI prototype. It is intentionally separated from the Vite frontend so the server can stay in CommonJS style, matching the baseline prototype you already built.

## What is included

- `index.js`: starts the Express server
- `app.js`: configures middleware and route mounting
- `config/database.js`: MongoDB connection helper
- `routes/`: participant, session, canvas, chat, document, and event endpoints
- `services/`: document processing, embeddings, retrieval, confidence scoring, and chat orchestration
- `utils/`: canvas serialization, text chunking, vector math, and system assignment helpers
- `models/`: the study-aware Mongoose schemas already drafted earlier

## Important design choice

The backend stores a **layout-rich** canvas state in MongoDB so the app can restore the exact map:

- node IDs
- node types
- node titles / text
- node coordinates
- node dimensions
- edge IDs
- edge source / target IDs
- edge labels
- edge source / target handles

However, the chat prompt does **not** use the full stored object. Before prompting the model, the backend projects the canvas down to semantic content only:

- node IDs
- node types
- node titles / text
- edge source / target relationships
- edge labels

That split keeps LLM context clean while still preserving the frontend layout in the database.

## Suggested next integration step

Update the frontend to call:

- `POST /api/participants/bootstrap`
- `POST /api/sessions`
- `GET /api/sessions/:sessionID/canvas`
- `PUT /api/sessions/:sessionID/canvas`
- `POST /api/sessions/:sessionID/chat`
- `POST /api/sessions/:sessionID/documents`

That will let the frontend stop relying on `localStorage` as the main source of truth.
