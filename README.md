# Shogi Teaching Assistant

An interactive shogi learning platform that combines a strong game engine with conversational AI to provide personalized, context-aware instruction.

## Architecture

- **Backend (Python/FastAPI)**: Game engine, USI integration, Gemini AI
- **Frontend (Next.js/React)**: Interactive board, chat interface
- **Engine**: YaneuraOu (USI-compatible shogi engine)

## Setup

### Backend

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
```

3. Activate virtual environment:
```bash
# Windows
.\venv\Scripts\activate

# macOS/Linux
source venv/bin/activate
```

4. Install dependencies:
```bash
pip install -r requirements.txt
```

5. Configure environment:
   - Copy `.env` and add your Gemini API key
   - Ensure `YaneuraOu.exe` is in `backend/engine/`

6. Run the backend:
```bash
uvicorn main:app --reload
```

### Frontend

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env.local`:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

## Features

- **Interactive Gameplay**: Play complete games with move-by-move feedback
- **AI Analysis**: Engine-powered position evaluation
- **Contextual Explanations**: Natural language teaching from Gemini
- **Visual Board**: Interactive shogi board with piece movement
- **Chat Interface**: Ask questions and get personalized guidance

## Technology Stack

- **Backend**: Python 3.14, FastAPI, python-shogi, google-generativeai
- **Frontend**: Next.js 16, React, TypeScript, TailwindCSS
- **Engine**: YaneuraOu (USI protocol)
- **AI**: Google Gemini 1.5 Flash

## License

See LICENSE file for details.
