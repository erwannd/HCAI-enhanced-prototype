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

The backend stores only the **semantic** canvas state in MongoDB:

- node IDs
- node types
- node titles / text
- edge IDs
- edge source / target IDs
- edge labels

It does **not** store coordinates, dimensions, or React Flow-specific UI details in `CanvasState`.

## Suggested next integration step

Update the frontend to call:

- `POST /api/participants/bootstrap`
- `POST /api/sessions`
- `GET /api/sessions/:sessionID/canvas`
- `PUT /api/sessions/:sessionID/canvas`
- `POST /api/sessions/:sessionID/chat`
- `POST /api/sessions/:sessionID/documents`

That will let the frontend stop relying on `localStorage` as the main source of truth.
