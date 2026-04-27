# Enhanced Prototype Models

These models are draft backend schemas for the enhanced prototype. They are written in the same CommonJS + Mongoose style as the baseline prototype, but adapted for the new session-based workflow.

## Why these models exist

- `Participant`: stores the study participant and assigned system condition.
- `StudySession`: separates multiple topic sessions for the same participant.
- `Document`: stores uploaded files and retrieval chunks, scoped to a session.
- `Interaction`: stores chat turns, retrieved evidence, and optional canvas context.
- `CanvasState`: stores the current logical canvas state without frontend-only fields.
- `CanvasOperationLog`: stores semantic canvas edits over time for auditability.
- `EventLog`: stores study telemetry, now scoped to session and system.

## Important modeling rule

`canvasContextSnapshot` intentionally stores only semantic content:

- node IDs
- node types
- titles / text
- edge IDs
- edge source/target relationships
- edge labels

It should **not** store frontend-only details such as:

- x/y coordinates
- pixel sizes
- selected state
- handle IDs
- styling

`CanvasState` is slightly different:

- it stores the semantic content above
- it also stores layout data needed to restore the visual map, such as node coordinates, node dimensions, and edge handle attachments

That means the database can restore the exact frontend layout, while prompt construction can still strip the state back down to semantic content only.

That separation keeps prompt construction cleaner while still preserving the learner's visual arrangement in storage.
