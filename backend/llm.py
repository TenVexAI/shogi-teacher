import google.generativeai as genai
import os
from typing import Dict, Any

class GeminiTeacher:
    def __init__(self):
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            genai.configure(api_key=api_key)
            # Use gemini-1.5-pro for better reliability
            self.model = genai.GenerativeModel('gemini-1.5-pro')
        else:
            self.model = None

    async def explain(self, sfen: str, analysis: Dict[str, Any], context: str = "") -> str:
        if not self.model:
            return "Gemini API key not found. Please set GEMINI_API_KEY in .env."
        
        best_move = analysis.get("bestmove", "unknown")
        score_cp = analysis.get("score_cp", 0)
        mate = analysis.get("mate")
        info = analysis.get("info", "")
        
        # Extract principal variation from info line
        pv_moves = ""
        if info:
            # PV is after "pv " in the info line
            # Example: "info depth 12 ... pv 8c8d 2g2f 8d8e 2f2e 2e2d"
            if " pv " in info:
                pv_part = info.split(" pv ")[1]
                # Take only the move sequence (USI format: digit+letter+digit+letter)
                moves = []
                for token in pv_part.split():
                    # USI moves: 4-5 chars, format like "7g7f" or "7g7f+"
                    if (len(token) >= 4 and len(token) <= 5 and 
                        token[0].isdigit() and token[1].isalpha() and 
                        token[2].isdigit() and token[3].isalpha()):
                        moves.append(token)
                    if len(moves) >= 5:  # Limit to first 5 moves
                        break
                pv_moves = " ".join(moves)
        
        evaluation_text = f"Score: {score_cp} centipawns"
        if mate:
            evaluation_text = f"Mate in {mate}"

        prompt = f"""
        You are a professional Shogi teacher. Analyze the following position and engine analysis to provide a helpful explanation for a student.
        
        Current Position (SFEN): {sfen}
        Engine Best Move: {best_move}
        Engine Evaluation: {evaluation_text}
        Expected Continuation (PV): {pv_moves if pv_moves else "Not available"}
        
        Please explain in 2-3 concise paragraphs:
        1. Why {best_move} is the best move (what does it accomplish?)
        2. The tactical/strategic ideas in the continuation line
        3. What the opponent should watch out for
        
        Use simple language suitable for intermediate players. Focus on concrete ideas, not vague concepts.
        """
        
        try:
            response = await self.model.generate_content_async(prompt)
            return response.text
        except Exception as e:
            return f"Error generating explanation: {e}"
