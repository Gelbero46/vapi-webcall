
# Twilio + Vapi Browser Call & Live Audio Streaming

This project demonstrates how to:
- Initiate browser-based calls using **Vapi's Voice API** (Vapi-Originated Calls)
- Passively listen to live audio from the call using **WebSocket streaming**
- Process raw PCM audio in the browser and play it in real-time

The backend is powered by **Flask (Python)** and the frontend is built with **Next.js (React)**.

---

## 🚀 Features
- ✅ Initiate outbound calls from the browser using Vapi
- ✅ Live listen to call audio via WebSocket
- ✅ Real-time audio playback using the Web Audio API
- ✅ Call status monitoring
- ✅ Clean resource management (WebSocket and audio context)

---

## 🛠️ Project Structure
```
root/
├── backend/          # Flask backend for call initiation and Vapi integration
├── frontend/         # Next.js frontend for browser UI and audio streaming
└── README.md         # This documentation
```

---

## 📦 Requirements

### Backend:
- Python 3.9+
- Flask
- `vapi_server_sdk` (install via `pip install vapi_server_sdk`)

### Frontend:
- Node.js 18+
- Next.js 14+

---

## 🔐 Environment Variables

### Backend:
```bash
# .env (backend)
VAPI_API_KEY=your_vapi_api_key
VAPI_ASSISTANT_ID=your_vapi_assistant_id
VAPI_PHONE_NUMBER_ID=your-twillo-phone-number-id
```

### Frontend:
```bash
# .env.local (frontend)
NEXT_PUBLIC_SERVER_URL=http://localhost:5000
```

---

## 📝 How to Get Vapi Credentials

1. Go to [Vapi Dashboard](https://dashboard.vapi.ai/).
2. Create a new project.
3. Get your **API Key** from the API Keys section.
4. Create or select a **Voice Assistant** to get your Assistant ID.

Optional: Configure additional assistant behaviors on Vapi Dashboard.

---

## ⚙️ Setup Instructions

### Backend Setup:
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

### Frontend Setup:
```bash
cd frontend
npm install
npm run dev
```

---

## 🔗 API Endpoints

### POST `/api/vapi_call`
Initiates a Vapi-Originated Call.

#### Request:
```json
{
  "to": "+1234567890"
}
```

#### Response:
```json
{
  "id": "vapi_call_id",
  "listenUrl": "wss://..."
}
```

---

## 🎧 Real-Time Audio Streaming

- The `listenUrl` is a WebSocket endpoint that streams **16-bit PCM audio**.
- The frontend:
  - Connects to the WebSocket
  - Decodes PCM to Float32
  - Plays the audio using the **Web Audio API**

---

## 🔍 Audio Processing Pipeline
1. Receive raw PCM data from WebSocket.
2. Convert `Int16Array` to normalized `Float32Array`.
3. Create `AudioBuffer` with correct sample rate (usually 8000 Hz or 16000 Hz).
4. Play audio using `AudioBufferSourceNode`.

📚 Referenced from:
- [MDN Web Audio API Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Vapi API Reference (2025)](https://docs.vapi.ai/api-reference/calls/create)

---

## 🧹 Recommended .gitignore
```gitignore
# Frontend
/frontend/node_modules
/frontend/.env.local
/.next
/out

# Backend
/backend/.venv
/backend/__pycache__/
/backend/.env
*.pyc

# System files
.DS_Store
.env
*.log
```


---

## 🙏 Acknowledgments
- [Vapi API](https://docs.vapi.ai/)
- [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

---
