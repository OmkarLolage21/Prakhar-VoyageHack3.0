# 🧭 Roameo — AI-Powered Travel Planner

Roameo is a full-stack, AI-powered travel planning platform that lets users discover destinations, generate day-by-day itineraries, search hotels and flights via the AI as well as with TBO API, and interact using natural voice commands — all through a modern Next.js interface.

---

## 📁 Repository Structure

```
Prakhar-VoyageHack3.0/
├── new-frontend/        # Next.js 16 + TypeScript frontend (Roameo UI)
├── backend/             # Python/Flask AI planning backend (phidata + Groq LLM)
├── TBO_backend/         # Python/Flask TBO hotel & flight integration backend
└── Voice_backend/       # Python/FastAPI voice command & transcription backend
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16.1, React 19, TypeScript 5.7, Tailwind CSS v4 |
| UI Components | Radix UI (shadcn/ui), Lucide React, Recharts, Embla Carousel |
| Maps | Mapbox GL JS v3|
| AI Backend | Python 3, Flask 2.3, phidata 2.7, Groq LLM |
| TBO Backend | Python 3, Flask 2.3, TBO Hotel & Air APIs |
| Voice Backend | Python 3, FastAPI, Sarvam AI (speech-to-text + translation) |
| Geocoding | Mapbox Geocoding API v5, geocode.xyz (fallback) |
| Web Search | DuckDuckGo Search, Newspaper4k |

---

## ✨ Key Features

- **AI Itinerary Planning** — Uses Groq LLM via phidata agents; generates structured day-by-day plans with GPS coordinates for each location.
- **TBO Hotel & Flight Search** — Live search of hotel inventory and one-way/round-trip flights through the TBO B2B travel API; results formatted as markdown tables.
- **Voice Planner** — Record audio in 10+ Indian languages, transcribe via Sarvam AI, extract travel intent (destination, dates, trip name, transport mode), and drive the full planning flow hands-free.
- **Mapbox Map Integration** — Interactive map with circle-draw radius search to find hotels and attractions within a custom area.
- **Session-Based State** — Each planning session maintains a full context object shared between the travel agent, booking agent, and live itinerary agent.
- **Live Itinerary Adjustment** — Adjust the itinerary on-the-fly based on mood/situation changes (weather, fatigue, time overruns).
- **Mock Booking Flow** — Create and "pay" for bookings via mock endpoints during demo/testing without hitting live TBO booking APIs.

---

## ⚙️ Setup & Installation

### Prerequisites

- Node.js ≥ 18, pnpm (or npm)
- Python 3.10+
- TBO API credentials (Hotel + Air)
- Mapbox Access Token
- Groq API Key
- Sarvam AI API Key (optional, for voice transcription)

---

### 1. Frontend (`new-frontend/`)

```bash
cd new-frontend
cp .env.example .env.local
# Fill in values (see Environment Variables section)
pnpm install
pnpm dev          # http://localhost:3000
```

---

### 2. AI Planning Backend (`backend/`)

```bash
cd backend
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
# Create .env with GROQ_API_KEY, MAPBOX_ACCESS_TOKEN (optional)
python app.py     # http://localhost:5000
```

---

### 3. TBO Backend (`TBO_backend/`)

```bash
cd TBO_backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in TBO credentials and Mapbox token
python app.py     # http://localhost:8001
```

---

### 4. Voice Backend (`Voice_backend/`)

```bash
cd Voice_backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Fill in SARVAM_API_KEY
uvicorn app:app --host 0.0.0.0 --port 8002 --reload
```

---
## 🔊 Voice Planner Flow

1. User clicks **Record** → browser captures audio via `MediaRecorder` API.
2. Audio blob (`audio/webm`) is POSTed to `POST /voice/transcribe`.
3. Sarvam AI `saaras:v3` transcribes and optionally translates to English.
4. Transcript is sent to `POST /voice/command` with the current `VoiceContext`.
5. Backend returns an `intent` (e.g., `suggest_places`, `add_hotel_to_cart`, `checkout`) and a list of `actions`.
6. Frontend dispatches actions (e.g., switching tabs, triggering hotel search, navigating stages).
7. TTS response is sent to `POST /voice/speak` for language-localized playback.

**Supported Voice Intents:** `suggest_places`, `set_trip_meta`, `add_place_to_day`, `confirm_places`, `search_hotels`, `add_hotel_to_cart`, `view_hotel`, `search_transport`, `add_transport_to_cart`, `checkout`, `go_transport`, `unknown`.

**Supported Languages (via Sarvam AI):** Hindi, Bengali, Gujarati, Kannada, Malayalam, Marathi, Odia, Punjabi, Tamil, Telugu + English.

---

## 📦 Frontend Pages

| Route | Description |
|---|---|
| `/` | Home page with hero search and popular destinations |
| `/hotels` | Hotel search with Mapbox map and circle-draw radius search |
| `/planner` | Step-by-step AI trip planner (chat + itinerary view) |
| `/voice-planner` | Voice-driven travel planner with real-time map |
| `/trips` | Saved trips list |
| `/trips/[id]` | Individual trip detail and booking view |

---
