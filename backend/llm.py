from anthropic import Anthropic
from typing import Dict, Any, Optional, List
from config_handler import get_llm_config
import os
import json
import re
import base64

class ClaudeTeacher:
    def __init__(self):
        self.reload_config()
    
    def reload_config(self):
        """Reload LLM configuration from config file"""
        config = get_llm_config()
        self.provider = config["selected_provider"]
        self.model = config["selected_model"]
        api_keys = config["api_keys"]
        
        # Load LLM settings
        self.claude_thinking = config.get("claude_thinking", False)
        self.openai_reasoning_effort = config.get("openai_reasoning_effort", "medium")
        self.verbosity = config.get("verbosity", "medium")
        
        # Initialize clients based on available API keys
        self.claude_client = None
        self.openai_client = None
        self.google_client = None
        
        # Helper function to validate API key (filter out masked/invalid keys)
        def is_valid_api_key(key: str) -> bool:
            """Check if API key is valid (not masked or empty)"""
            if not key:
                return False
            # Filter out masked keys (bullet characters, ellipsis, etc.)
            if '•' in key or '...' in key or '*' in key:
                return False
            # API keys should be ASCII-only
            try:
                key.encode('ascii')
                return True
            except UnicodeEncodeError:
                return False
        
        # Clean up invalid keys from config (and save if any were removed)
        cleaned_keys = {}
        keys_removed = False
        for provider, key in api_keys.items():
            if is_valid_api_key(key):
                cleaned_keys[provider] = key
            elif key:  # Key exists but is invalid
                keys_removed = True
                print(f"Warning: Removing invalid API key for {provider} from config")
        
        # If we removed any invalid keys, update the config file
        if keys_removed:
            from config_handler import update_llm_config as update_cfg
            update_cfg(api_keys=cleaned_keys, provider=None, model=None)
            print("Cleaned invalid API keys from config.json")
        
        # Use cleaned keys for initialization
        if "claude" in cleaned_keys:
            try:
                self.claude_client = Anthropic(api_key=cleaned_keys["claude"].strip())
            except Exception as e:
                print(f"Failed to initialize Claude client: {e}")
        
        if "openai" in cleaned_keys:
            try:
                import openai
                self.openai_client = openai.OpenAI(api_key=cleaned_keys["openai"].strip())
            except Exception as e:
                print(f"Failed to initialize OpenAI client: {e}")
        
        if "google" in cleaned_keys:
            try:
                import google.generativeai as genai
                genai.configure(api_key=cleaned_keys["google"].strip())
                self.google_client = genai
            except Exception as e:
                print(f"Failed to initialize Google client: {e}")
    
    def get_active_client(self):
        """Get the currently selected LLM client"""
        if self.provider == "claude":
            return self.claude_client
        elif self.provider == "openai":
            return self.openai_client
        elif self.provider == "google":
            return self.google_client
        return None
    
    def get_verbosity_instruction(self) -> str:
        """Get the verbosity instruction based on user setting"""
        if self.verbosity == "low":
            return "\n\nIMPORTANT: Be concise and direct. Provide brief explanations."
        elif self.verbosity == "high":
            return "\n\nIMPORTANT: Provide comprehensive, detailed explanations with examples."
        else:  # medium (default)
            return ""
    
    def get_valid_reasoning_effort(self) -> str:
        """
        Get valid reasoning effort for the current model.
        Different GPT-5 models support different reasoning levels.
        """
        model_lower = self.model.lower()
        
        # GPT-5.1 supports none, low, medium, high (default: none)
        if "gpt-5.1" in model_lower or "gpt-5-1" in model_lower:
            valid_levels = ["none", "low", "medium", "high"]
            if self.openai_reasoning_effort in valid_levels:
                return self.openai_reasoning_effort
            # Default to none if invalid
            return "none"
        
        # GPT-5 Mini supports minimal, low, medium, high
        if "gpt-5-mini" in model_lower:
            valid_levels = ["minimal", "low", "medium", "high"]
            if self.openai_reasoning_effort in valid_levels:
                return self.openai_reasoning_effort
            # Map 'none' to 'minimal' for mini
            if self.openai_reasoning_effort == "none":
                return "minimal"
            return "low"  # Default
        
        # For other GPT-5 models, default to medium
        if "gpt-5" in model_lower:
            return "medium"
        
        # For non-GPT-5 models (o1, o3), use as-is
        return self.openai_reasoning_effort
    
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
        client = self.get_active_client()
        if not client:
            return f"No API key configured for {self.provider}. Please add your API key in the Resources & LLM window."
        
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
        
        # Add verbosity instruction
        prompt_parts.append(self.get_verbosity_instruction())
        
        prompt = "\n".join(prompt_parts)
        
        # Build messages array with conversation history
        messages = []
        
        # Add conversation history if provided (skip first system message if it exists)
        # Limit to last 10 messages to prevent context from becoming too large
        if conversation_history:
            # Filter to user/assistant messages only
            valid_history = [
                msg for msg in conversation_history 
                if msg.get("role") in ["user", "assistant"]
            ]
            # Take only the last 10 messages
            recent_history = valid_history[-10:] if len(valid_history) > 10 else valid_history
            
            for msg in recent_history:
                messages.append({
                    "role": msg["role"],
                    "content": msg["content"]
                })
        
        # Add current prompt as the latest user message
        messages.append({"role": "user", "content": prompt})
        
        try:
            if self.provider == "claude":
                # Determine max_tokens based on whether thinking is enabled
                # When thinking is enabled, max_tokens must be > budget_tokens
                max_tokens = 1024
                if self.claude_thinking and "sonnet-4" in self.model.lower():
                    max_tokens = 8000  # 5000 for thinking + 3000 for response
                
                # Build API parameters
                api_params = {
                    "model": self.model,
                    "max_tokens": max_tokens,
                    "messages": messages
                }
                
                # Add extended thinking if enabled (for Sonnet 4.5+ models)
                if self.claude_thinking and "sonnet-4" in self.model.lower():
                    api_params["thinking"] = {
                        "type": "enabled",
                        "budget_tokens": 5000
                    }
                
                response = client.messages.create(**api_params)
                
                # Extract text from response (handle thinking blocks)
                # When thinking is enabled, content may have multiple blocks: ThinkingBlock + TextBlock
                result_text = ""
                for block in response.content:
                    # Skip thinking blocks, only extract text blocks
                    if hasattr(block, 'text'):
                        result_text += block.text
                
                return result_text
                
            elif self.provider == "openai":
                print(f"OpenAI: Sending request with model: {self.model}")
                print(f"OpenAI: Message count: {len(messages)}")
                
                # Check if this is a GPT-5 model (uses Responses API)
                is_gpt5 = "gpt-5" in self.model.lower()
                
                # Build API parameters (different for Responses API vs Chat Completions API)
                if is_gpt5:
                    # Responses API uses 'input' parameter instead of 'messages'
                    # Convert messages array to a single input string
                    input_text = "\n\n".join([
                        f"{msg['role']}: {msg['content']}" for msg in messages
                    ])
                    
                    # Get valid reasoning effort for this specific model
                    valid_effort = self.get_valid_reasoning_effort()
                    print(f"OpenAI: Using reasoning effort: {valid_effort} (requested: {self.openai_reasoning_effort})")
                    
                    # Responses API uses nested objects for reasoning and text parameters
                    api_params = {
                        "model": self.model,
                        "input": input_text,
                        "reasoning": {
                            "effort": valid_effort
                        },
                        "text": {
                            "verbosity": self.verbosity
                        }
                    }
                    
                    # GPT-5 models use the Responses API
                    response = client.responses.create(**api_params)
                    
                    print(f"OpenAI: Response received")
                    print(f"OpenAI: Output text: {response.output_text}")
                    
                    # Responses API returns output_text directly
                    return response.output_text
                    
                else:
                    # Chat Completions API
                    api_params = {
                        "model": self.model,
                        "max_completion_tokens": 4096,
                        "messages": messages
                    }
                    
                    # Add reasoning_effort for o1/o3 models
                    if "o1" in self.model.lower() or "o3" in self.model.lower():
                        api_params["reasoning_effort"] = self.openai_reasoning_effort
                    
                    # Other models use Chat Completions API
                    response = client.chat.completions.create(**api_params)
                    
                    print(f"OpenAI: Response received")
                    print(f"OpenAI: Choices count: {len(response.choices)}")
                    
                    choice = response.choices[0]
                    finish_reason = choice.finish_reason
                    message = choice.message
                    content = message.content
                    refusal = getattr(message, 'refusal', None)
                    
                    print(f"OpenAI: Finish reason: {finish_reason}")
                    print(f"OpenAI: Content: {content}")
                    print(f"OpenAI: Refusal: {refusal}")
                    print(f"OpenAI: Content type: {type(content)}")
                    print(f"OpenAI: Content length: {len(content) if content else 0}")
                    
                    if refusal:
                        return f"OpenAI refused to respond: {refusal}"
                    
                    if not content:
                        if finish_reason == "length":
                            return "The response was cut off due to token limits. Try asking a shorter question or starting a new conversation."
                        return "OpenAI returned an empty response"
                    
                    # Append a note if the response was cut off
                    if finish_reason == "length":
                        content += "\n\n*(Response was cut off due to length limit)*"
                    
                    return content
                
            elif self.provider == "google":
                # Google Gemini uses a different format
                model = client.GenerativeModel(self.model)
                
                # Convert messages to Gemini format
                gemini_messages = []
                for msg in messages:
                    role = "user" if msg["role"] == "user" else "model"
                    gemini_messages.append({
                        "role": role,
                        "parts": [msg["content"]]
                    })
                
                # Start chat with history
                if len(gemini_messages) > 1:
                    chat = model.start_chat(history=gemini_messages[:-1])
                    response = chat.send_message(gemini_messages[-1]["parts"][0])
                else:
                    response = model.generate_content(gemini_messages[0]["parts"][0])
                
                return response.text
            
            else:
                return f"Unsupported provider: {self.provider}"
                
        except Exception as e:
            # Handle exception message encoding safely
            import traceback
            import sys
            
            # Get error details
            error_details = traceback.format_exc()
            
            # Try to get a clean error message
            try:
                error_msg = str(e)
            except:
                error_msg = repr(e)
            
            # Log the full traceback for debugging (with encoding safety)
            try:
                print(f"LLM Error: {error_msg}", file=sys.stderr)
                print(error_details, file=sys.stderr)
            except UnicodeEncodeError:
                # If console can't handle Unicode, log without special chars
                print(f"LLM Error occurred (encoding issue in error message)", file=sys.stderr)
            
            # Return a safe error message
            return f"Error generating explanation: {error_msg}"
    
    def analyze_board_image(self, image_base64: str) -> dict:
        """
        Analyze a shogi board image and return SFEN notation.
        
        Args:
            image_base64: Base64 encoded image (data URL format: data:image/...;base64,...)
        
        Returns:
            dict with 'sfen', 'confidence', and 'notes' keys
        """
        self.reload_config()
        
        # Extract the base64 data from data URL if present
        if image_base64.startswith('data:'):
            # Format: data:image/jpeg;base64,/9j/4AAQ...
            parts = image_base64.split(',', 1)
            if len(parts) == 2:
                image_data = parts[1]
                media_type = parts[0].split(':')[1].split(';')[0]
            else:
                raise ValueError("Invalid image data URL format")
        else:
            image_data = image_base64
            media_type = "image/jpeg"
        
        prompt = """Analyze this shogi board image and output the position in SFEN notation.

CRITICAL: A standard shogi game has EXACTLY 40 pieces total. You MUST account for ALL pieces:
- 2 Kings (1 each side) - K/k
- 2 Rooks (1 each, may be captured/promoted) - R/r or +R/+r
- 2 Bishops (1 each, may be captured/promoted) - B/b or +B/+b
- 4 Golds (2 each side) - G/g
- 4 Silvers (2 each, may be promoted) - S/s or +S/+s
- 4 Knights (2 each, may be promoted) - N/n or +N/+n
- 4 Lances (2 each, may be promoted) - L/l or +L/+l
- 18 Pawns (9 each, may be promoted) - P/p or +P/+p

RULES FOR ANALYSIS:
1. White (Gote, 後手) is at the TOP of the board, Black (Sente, 先手) is at the BOTTOM
2. Pieces pointing UPWARD belong to White (gote) - use lowercase letters
3. Pieces pointing DOWNWARD belong to Black (sente) - use UPPERCASE letters
4. The board is 9x9, files are numbered 9-1 from left to right, ranks are a-i from top to bottom
5. If a piece is NOT visible on the board, it MUST be in someone's hand (captured)
6. Check the piece stands (komadai) on the sides of the board for captured pieces

PIECE NOTATION:
- K/k = King (玉/王)
- R/r = Rook (飛)
- B/b = Bishop (角)
- G/g = Gold (金)
- S/s = Silver (銀)
- N/n = Knight (桂)
- L/l = Lance (香)
- P/p = Pawn (歩)
- For promoted pieces, prefix with '+': +R/+r (dragon), +B/+b (horse), +S/+s, +N/+n, +L/+l, +P/+p (tokin)

SFEN FORMAT - CRITICAL RULES:
- Each rank MUST sum to EXACTLY 9 (pieces + empty squares)
- Each piece counts as 1, each number represents that many empty squares
- Promoted pieces (+P, +R, etc.) count as 1
- Describe each rank from rank 'a' (top) to rank 'i' (bottom)
- Within each rank, describe from file 9 (left) to file 1 (right)
- Use numbers to indicate consecutive empty squares (e.g., '4' for 4 empty squares)
- Separate ranks with '/'
- After the board, add: [space][turn][space][pieces in hand][space][move count]
  - turn: 'b' for Black to move, 'w' for White to move
  - pieces in hand: Black's pieces first (UPPERCASE), then White's (lowercase)
    - Format: count before piece if >1, e.g., 'R2B3P' = Rook, 2 Bishops, 3 Pawns for Black
    - Use '-' only if NEITHER player has pieces in hand
  - move count: typically '1' for a position from an image

ROW COUNTING EXAMPLES:
- "lnsgkgsnl" = 9 pieces = 9 ✓
- "1r5b1" = 1 + r + 5 + b + 1 = 1+1+5+1+1 = 9 ✓
- "ppppppppp" = 9 pieces = 9 ✓
- "9" = 9 empty squares = 9 ✓
- "4P4" = 4 + P + 4 = 4+1+4 = 9 ✓
- "1r1g1g2" = 1+1+1+1+1+1+2 = 8 ✗ WRONG - missing 1!
- "1r1g1g3" = 1+1+1+1+1+1+3 = 9 ✓ CORRECT

EXAMPLE SFEN (standard starting position):
lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1

EXAMPLE with pieces in hand:
lnsgkgsnl/1r5b1/pppp1pppp/9/9/4P4/PPPP1PPPP/1B5R1/LNSGKGSNL w p 1
(White has 1 pawn in hand)

Look carefully at:
1. Each piece's orientation (which way it points)
2. Whether pieces are promoted (usually shown with red/different color kanji, or flipped)
3. The piece stands (komadai) on the sides showing captured pieces
4. Count all pieces - if any are missing from the board, they should be in hand

OUTPUT FORMAT (JSON):
{
    "sfen": "<the SFEN string>",
    "confidence": "<high|medium|low>",
    "notes": "<describe any missing/uncertain pieces, whose hand they might be in>"
}

Only output the JSON, nothing else."""

        try:
            if self.provider == "claude":
                if not self.claude_client:
                    raise ValueError("Claude API key not configured")
                
                response = self.claude_client.messages.create(
                    model=self.model or "claude-sonnet-4-20250514",
                    max_tokens=1024,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": media_type,
                                        "data": image_data,
                                    }
                                },
                                {
                                    "type": "text",
                                    "text": prompt
                                }
                            ]
                        }
                    ]
                )
                result_text = response.content[0].text
                
            elif self.provider == "openai":
                if not self.openai_client:
                    raise ValueError("OpenAI API key not configured")
                
                # Use max_completion_tokens for newer models (gpt-5+), max_tokens for older
                model_name = self.model or "gpt-4o"
                is_new_model = model_name.startswith("gpt-5") or model_name.startswith("o1") or model_name.startswith("o3")
                token_param = {"max_completion_tokens": 1024} if is_new_model else {"max_tokens": 1024}
                
                response = self.openai_client.chat.completions.create(
                    model=model_name,
                    **token_param,
                    messages=[
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:{media_type};base64,{image_data}"
                                    }
                                },
                                {
                                    "type": "text",
                                    "text": prompt
                                }
                            ]
                        }
                    ]
                )
                result_text = response.choices[0].message.content
                
            elif self.provider == "google":
                if not self.google_client:
                    raise ValueError("Google API key not configured")
                
                # Google Gemini can accept base64 image directly
                model = self.google_client.GenerativeModel(self.model or "gemini-1.5-pro")
                
                # Create image part for Gemini
                image_part = {
                    "mime_type": media_type,
                    "data": image_data
                }
                
                response = model.generate_content([prompt, image_part])
                result_text = response.text
                
            else:
                raise ValueError(f"Unsupported provider: {self.provider}")
            
            # Try to extract JSON from the response
            json_match = re.search(r'\{[^{}]*\}', result_text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
            else:
                # If no JSON found, try to parse the whole response
                result = json.loads(result_text)
            
            # Validate required fields
            if 'sfen' not in result:
                raise ValueError("No SFEN found in response")
            
            # Ensure confidence is valid
            if result.get('confidence') not in ['high', 'medium', 'low']:
                result['confidence'] = 'medium'
            
            return result
            
        except json.JSONDecodeError as e:
            # If JSON parsing fails, try to extract SFEN from text
            sfen_match = re.search(r'[lnsgkrp1-9+/]+\s+[bw]\s+[-\w]+\s+\d+', result_text, re.IGNORECASE)
            if sfen_match:
                return {
                    'sfen': sfen_match.group(),
                    'confidence': 'low',
                    'notes': 'SFEN extracted from non-JSON response'
                }
            raise ValueError(f"Failed to parse LLM response: {e}")
        except Exception as e:
            raise ValueError(f"Image analysis failed: {str(e)}")
