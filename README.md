# Chessbook

Chess opening repertoire trainer — FastAPI backend + React frontend.

## Quick start

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Backend

```bash
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

Frontend proxies `/api/*` to `http://localhost:8000` via Vite config.

---

## Project structure

```
chessbook/
├── frontend/
│   └── src/
│       ├── components/
│       │   └── Board.jsx          # Canvas board + heatmap rendering
│       ├── hooks/
│       │   └── useStockfish.js    # Stockfish WebWorker hook
│       ├── screens/
│       │   ├── Dashboard.jsx
│       │   ├── Repertoire.jsx
│       │   ├── Train.jsx
│       │   └── Import.jsx
│       └── utils/
│           ├── chess.js           # Move gen, attack maps, FEN, applyMove
│           ├── repertoire.js      # Static opening data (dev only)
│           └── chesscom.js        # Chess.com API client + deviation detection
└── backend/
    └── app/
        ├── routers/
        │   ├── games.py           # Chess.com import, deviation detection
        │   ├── repertoire.py      # CRUD + SM-2 spaced repetition
        │   └── users.py           # Auth skeleton
        └── main.py
```

---

## Key decisions & next steps

### Replace the move generator
`src/utils/chess.js` is a simplified move generator — no en passant, castling rights,
or pin detection. Replace with `chess.js` for correctness:

```bash
cd frontend && npm install chess.js
```

Then swap `applyMove` / `legalMovesForPiece` calls in `Board.jsx` and the screens.

### Wire the real Chess.com import
The Import screen currently uses mock data. To use the real API:

1. In `Import.jsx`, call `GET /api/games/import?username=X&months=2`
2. The FastAPI route fetches from Chess.com, parses PGN, and runs deviation detection
3. Chess.com's API is public — no key needed, but rate-limit to ~1 req/sec

### Add a database
The backend uses an in-memory dict. Add PostgreSQL:

```bash
# create DB
createdb chessbook

# set env var
export DATABASE_URL=postgresql://localhost/chessbook

# run migrations (after creating models)
alembic upgrade head
```

### Stockfish in production
The app loads Stockfish from CDN. For production, copy it locally:

```bash
cd frontend/public
curl -O https://cdn.jsdelivr.net/npm/stockfish@16.0.0/src/stockfish.js
```

Then change the Worker path in `useStockfish.js` to `'/stockfish.js'`.

### Deploy
- Frontend → Vite build → S3 + CloudFront (matches your existing AWS stack)
- Backend → Docker → EKS or Lambda (matches AV4 architecture)
- Add CORS origin for your CloudFront domain in `main.py`
