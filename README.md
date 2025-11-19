# Shogi Teaching Assistant

An interactive shogi learning platform that combines a strong game engine with conversational AI to provide personalized, context-aware instruction.

## Architecture

- **Backend (Python/FastAPI)**: Game engine, USI integration, Claude AI
- **Frontend (Next.js/React)**: Interactive board, chat interface, move history with clock
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

5. Configure API key (choose one method):
   
   **Option A: Using config.json (Recommended)**
   - Copy `backend/config.json.example` to `backend/config.json`
   - Add your Claude API key to `config.json`
   - You can also configure this via the settings UI in the app
   
   **Option B: Using .env file**
   - Create a `.env` file in the backend directory
   - Add: `CLAUDE_API_KEY=your-api-key-here`
   
   **Note**: Ensure `YaneuraOu.exe` is in `backend/engine/`

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
- **Move History**: Track all moves with timestamps and time per move
- **Game Clock**: Built-in timer with start/pause controls
- **AI Analysis**: Engine-powered position evaluation with best move suggestions
- **Contextual Explanations**: Natural language teaching from Claude AI
- **Visual Board**: Interactive shogi board with proper piece orientation
- **Chat Interface**: Ask questions and get personalized guidance
- **Hint System**: Get hints for the best move in any position
- **Standard Notation**: Moves displayed in readable shogi notation (e.g., P-7f, Sx6h)

## Technology Stack

- **Backend**: Python 3.14, FastAPI, python-shogi, anthropic (Claude API)
- **Frontend**: Next.js 16, React, TypeScript, TailwindCSS
- **Engine**: YaneuraOu (USI protocol)
- **AI**: Claude 3.5 Haiku

## License

See LICENSE file for details.
