import google.generativeai as genai
import os
from typing import Dict, Any

class GeminiTeacher:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel('gemini-1.5-flash')
        else:
            self.model = None

    async def explain(self, sfen: str, analysis: Dict[str, Any], context: str = "") -> str:
        if not self.model:
            return "Gemini API key not found. Please set GEMINI_API_KEY in .env."
        
        best_move = analysis.get("bestmove", "unknown")
        score_cp = analysis.get("score_cp", 0)
        mate = analysis.get("mate")
        
        evaluation_text = f"Score: {score_cp} centipawns"
        if mate:
            evaluation_text = f"Mate in {mate}"

        prompt = f"""
        You are a professional Shogi teacher. Analyze the following position and engine analysis to provide a helpful explanation for a student.
        
        Current Position (SFEN): {sfen}
        Engine Best Move: {best_move}
        Engine Evaluation: {evaluation_text}
        
        Please explain:
        1. Why the engine suggests {best_move}.
        2. The strategic implications of this move.
        3. Any immediate threats or tactical opportunities.
        
        Keep the explanation concise but educational.
        """
        
        try:
            response = await self.model.generate_content_async(prompt)
            return response.text
        except Exception as e:
            return f"Error generating explanation: {e}"

