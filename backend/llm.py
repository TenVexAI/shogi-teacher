from anthropic import Anthropic
from typing import Dict, Any, Optional, List
from config_handler import get_api_key

class ClaudeTeacher:
    def __init__(self):
        api_key = get_api_key()
        if api_key:
            self.client = Anthropic(api_key=api_key)
        else:
            self.client = None
    
    def build_game_context(self, session: Any, include_moves: int = 10) -> str:
        """
        Build comprehensive game context for LLM.
        
        Args:
            session: GameSession object with all game data
            include_moves: Number of recent moves to include (default: last 10)
        
        Returns:
            Formatted context string
        """
        context_parts = []
        
        # Game mode and players
        mode_desc = {
            'casual': 'Casual game',
            'training': 'Training session',
            'competitive': 'Competitive game',
            'puzzle': 'Puzzle solving',
            'analysis': 'Position analysis'
        }
        context_parts.append(f"**Game Mode:** {mode_desc.get(session.mode, session.mode)}")
        context_parts.append(f"**Black Player:** {session.black_player}")
        context_parts.append(f"**White Player:** {session.white_player}")
        
        # Move history
        if session.moves and len(session.moves) > 0:
            context_parts.append(f"\n**Move History** (last {min(include_moves, len(session.moves))} moves):")
            recent_moves = session.moves[-include_moves:] if len(session.moves) > include_moves else session.moves
            
            for move in recent_moves:
                move_desc = f"{move.move_number}. {move.move_algebraic} ({move.move_usi})"
                
                # Add move quality if available
                if move.classification:
                    move_desc += f" - {move.classification}"
                if move.cp_loss is not None and move.cp_loss != 0:
                    move_desc += f" (CP loss: {move.cp_loss})"
                
                context_parts.append(f"  {move_desc}")
        else:
            context_parts.append("\n**Move History:** Game just started")
        
        # User notes
        if session.user_notes:
            context_parts.append(f"\n**User Notes:** {session.user_notes}")
        
        return "\n".join(context_parts)

    async def explain(self, sfen: str, analysis: Dict[str, Any], context: str = "", conversation_history: Optional[List[Dict[str, str]]] = None) -> str:
        if not self.client:
            return "Claude API key not found. Please set CLAUDE_API_KEY in .env or configure it in settings."
        
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

        # Build prompt with optional game context
        prompt_parts = ["""You are a professional SHOGI teacher (Japanese chess, NOT Western chess).

CRITICAL: This is SHOGI, not Western chess. Use proper shogi terminology:
- Use "Black" and "White" for players (NOT colors like in chess)
- Files are numbered 9-1 from RIGHT to LEFT (e.g., 9th file, 1st file)
- Ranks are lettered a-i from TOP to BOTTOM
- Talk about "files" and "ranks", NOT "queenside", "kingside", or other chess terms
- Mention shogi-specific tactics: drops, piece promotions, gold generals, silver generals, etc.
- Remember pieces can be captured and DROPPED back onto the board

**SHOGI NOTATION GUIDE** (The moves you see use these abbreviations):
- K = King (玉/王)
- R = Rook (飛)
- B = Bishop (角)
- G = Gold General (金)
- S = Silver General (銀)
- N = Knight (桂)
- L = Lance (香)
- P = Pawn (歩)
- +R = Promoted Rook/Dragon (龍)
- +B = Promoted Bishop/Horse (馬)
- +S = Promoted Silver (成銀)
- +N = Promoted Knight (成桂)
- +L = Promoted Lance (成香)
- +P = Promoted Pawn/Tokin (と)

Move format examples:
- "K-6a" = King moves to 6a (NOT Knight!)
- "N-2c" = Knight moves to 2c
- "S*4e" = Silver DROP on 4e (piece placed from hand)
- "Px5d+" = Pawn captures on 5d and PROMOTES

Analyze the following SHOGI position and provide a helpful explanation for a student."""]
        
        # Add game context if provided
        if context:
            prompt_parts.append(f"\n**Game Context:**\n{context}\n")
        
        prompt_parts.append(f"""
**Current SHOGI Position Analysis:**
- Position (SFEN notation): {sfen}
- Engine Best Move: {best_move}
- Engine Evaluation: {evaluation_text}
- Expected Continuation (PV): {pv_moves if pv_moves else "Not available"}

Please provide a clear, educational explanation covering:
1. Why {best_move} is the recommended move (what does it accomplish in this SHOGI position?)
2. The tactical/strategic ideas in the continuation (mention specific shogi concepts)
3. What the opponent should be aware of

Use proper shogi terminology throughout. Use simple language suitable for intermediate players. Focus on concrete, actionable ideas rather than vague concepts.
""")
        
        prompt = "\n".join(prompt_parts)
        
        # Build messages array with conversation history
        messages = []
        
        # Add conversation history if provided (skip first system message if it exists)
        if conversation_history:
            for msg in conversation_history:
                # Only add user and assistant messages, skip system messages
                if msg.get("role") in ["user", "assistant"]:
                    messages.append({
                        "role": msg["role"],
                        "content": msg["content"]
                    })
        
        # Add current prompt as the latest user message
        messages.append({"role": "user", "content": prompt})
        
        try:
            message = self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                messages=messages
            )
            return message.content[0].text
        except Exception as e:
            return f"Error generating explanation: {e}"
