"""
PSN (Portable Shogi Notation) Format Parser and Exporter

PSN is similar to chess PGN, using algebraic notation for moves.
"""

import re
import shogi
from datetime import datetime
from typing import Optional, List
from .base import BaseParser, GameRecord, GameMetadata, ParsedMove


class PSNParser(BaseParser):
    """Parser for PSN format game records"""
    
    # Header pattern [Key "Value"]
    HEADER_PATTERN = re.compile(r'\[(\w+)\s+"([^"]*)"\]')
    
    # Move pattern: P-7f, Bx3c+, P*5e, G6a-5b, etc.
    MOVE_PATTERN = re.compile(
        r'(\+)?'  # Promoted prefix
        r'([PLNSGBRK])'  # Piece
        r'(\d[a-i])?'  # Source square (optional)
        r'([-x*])'  # Separator: - move, x capture, * drop
        r'(\d[a-i])'  # Destination
        r'(\+)?'  # Promotion suffix
        r'(=[PLNSGBRK])?'  # Piece change (rare)
    )
    
    def parse(self, content: str) -> GameRecord:
        """Parse PSN content into a GameRecord"""
        metadata = GameMetadata()
        moves = []
        comments = []
        
        # Split headers and movetext
        lines = content.split('\n')
        in_moves = False
        movetext = []
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Parse headers
            header_match = self.HEADER_PATTERN.match(line)
            if header_match and not in_moves:
                key = header_match.group(1)
                value = header_match.group(2)
                self._parse_header(metadata, key, value)
                continue
            
            # Start of movetext
            if not line.startswith('['):
                in_moves = True
                movetext.append(line)
        
        # Parse movetext
        full_movetext = ' '.join(movetext)
        
        # Remove comments and variations
        full_movetext = re.sub(r'\{[^}]*\}', '', full_movetext)  # Remove {...}
        full_movetext = re.sub(r'\([^)]*\)', '', full_movetext)  # Remove (...)
        
        board = shogi.Board()
        move_num = 0
        
        # Find all moves
        for match in self.MOVE_PATTERN.finditer(full_movetext):
            move_num += 1
            player = "black" if move_num % 2 == 1 else "white"
            
            move = self._parse_move(match, board, move_num, player)
            if move:
                moves.append(move)
                # Apply move
                try:
                    m = shogi.Move.from_usi(move.move_usi)
                    board.push(m)
                except:
                    pass
        
        return GameRecord(
            metadata=metadata,
            moves=moves,
            starting_sfen=shogi.Board().sfen(),
            comments=comments
        )
    
    def _parse_header(self, metadata: GameMetadata, key: str, value: str):
        """Parse a PSN header"""
        key_lower = key.lower()
        
        if key_lower == 'sente' or key_lower == 'black':
            metadata.black_name = value
        elif key_lower == 'gote' or key_lower == 'white':
            metadata.white_name = value
        elif key_lower == 'event':
            metadata.event = value
        elif key_lower == 'site':
            metadata.site = value
        elif key_lower == 'date':
            try:
                metadata.date = datetime.strptime(value, '%Y.%m.%d')
            except:
                try:
                    metadata.date = datetime.strptime(value, '%Y/%m/%d')
                except:
                    metadata.extra['date'] = value
        elif key_lower == 'round':
            metadata.round = value
        elif key_lower == 'result':
            metadata.result = value
        elif key_lower == 'opening':
            metadata.opening = value
        elif key_lower == 'timecontrol':
            metadata.time_control = value
        else:
            metadata.extra[key] = value
    
    def _parse_move(self, match, board: shogi.Board, move_num: int, player: str) -> Optional[ParsedMove]:
        """Parse a PSN move match"""
        groups = match.groups()
        
        promoted_prefix = groups[0]  # + before piece (already promoted)
        piece = groups[1]  # Piece letter
        source = groups[2]  # Source square (optional)
        separator = groups[3]  # -, x, or *
        dest = groups[4]  # Destination square
        promotion = groups[5]  # + after destination (promote)
        
        # Full piece with promotion prefix
        full_piece = ('+' + piece) if promoted_prefix else piece
        
        # Build USI move
        if separator == '*':
            # Drop move
            move_usi = f"{piece}*{dest}"
        elif source:
            # Move with explicit source
            promo = '+' if promotion else ''
            move_usi = f"{source}{dest}{promo}"
        else:
            # Find source from legal moves
            move_usi = self._find_source(board, full_piece, dest, promotion == '+')
            if not move_usi:
                return None
        
        # Build algebraic notation
        algebraic = f"{'+' if promoted_prefix else ''}{piece}"
        if source:
            algebraic += source
        algebraic += f"{separator}{dest}"
        if promotion:
            algebraic += "+"
        
        return ParsedMove(
            move_number=move_num,
            player=player,
            move_usi=move_usi,
            move_algebraic=algebraic,
        )
    
    def _find_source(self, board: shogi.Board, piece: str, dest: str, promotes: bool) -> Optional[str]:
        """Find source square from legal moves"""
        to_idx = self._square_to_index(dest)
        if to_idx is None:
            return None
        
        for move in board.legal_moves:
            if move.to_square == to_idx:
                from_piece = board.piece_at(move.from_square)
                if from_piece:
                    piece_char = from_piece.symbol().upper()
                    # Handle promoted pieces
                    if piece.startswith('+'):
                        if '+' + piece_char == piece:
                            promotion = '+' if promotes else ''
                            return f"{self._index_to_square(move.from_square)}{dest}{promotion}"
                    else:
                        if piece_char == piece:
                            promotion = '+' if promotes else ''
                            return f"{self._index_to_square(move.from_square)}{dest}{promotion}"
        
        return None
    
    def _square_to_index(self, square: str) -> Optional[int]:
        """Convert USI square to board index"""
        try:
            file = int(square[0])
            rank = ord(square[1]) - ord('a')
            return (9 - file) + rank * 9
        except:
            return None
    
    def _index_to_square(self, idx: int) -> str:
        """Convert board index to USI square"""
        file = 9 - (idx % 9)
        rank = chr(ord('a') + idx // 9)
        return f"{file}{rank}"
    
    def export(self, record: GameRecord) -> str:
        """Export GameRecord to PSN format"""
        lines = []
        
        # Headers
        lines.append(f'[Event "{record.metadata.event or "Casual Game"}"]')
        lines.append(f'[Site "{record.metadata.site or "?"}"]')
        if record.metadata.date:
            lines.append(f'[Date "{record.metadata.date.strftime("%Y.%m.%d")}"]')
        else:
            lines.append(f'[Date "{datetime.now().strftime("%Y.%m.%d")}"]')
        lines.append(f'[Round "{record.metadata.round or "-"}"]')
        lines.append(f'[Sente "{record.metadata.black_name}"]')
        lines.append(f'[Gote "{record.metadata.white_name}"]')
        lines.append(f'[Result "{record.metadata.result or "*"}"]')
        if record.metadata.opening:
            lines.append(f'[Opening "{record.metadata.opening}"]')
        lines.append("")
        
        # Moves
        board = shogi.Board(record.starting_sfen)
        move_strs = []
        
        for i, move in enumerate(record.moves):
            usi = move.move_usi
            
            # Add move number for black moves
            if move.player == "black":
                move_strs.append(f"{(i // 2) + 1}.")
            
            if '*' in usi:
                # Drop
                piece = usi[0].upper()
                dest = usi[2:4]
                move_strs.append(f"{piece}*{dest}")
            else:
                from_sq = usi[0:2]
                to_sq = usi[2:4]
                promotes = usi.endswith('+')
                
                # Get piece and check capture
                from_idx = self._square_to_index(from_sq)
                to_idx = self._square_to_index(to_sq)
                
                piece = board.piece_at(from_idx)
                captured = board.piece_at(to_idx)
                
                if piece:
                    piece_char = piece.symbol().upper()
                    # Check if already promoted
                    if piece_char in ['+P', '+L', '+N', '+S', '+B', '+R']:
                        prefix = '+'
                        piece_char = piece_char[1]
                    else:
                        prefix = ''
                    
                    separator = 'x' if captured else '-'
                    promo = '+' if promotes else ''
                    
                    move_strs.append(f"{prefix}{piece_char}{from_sq}{separator}{to_sq}{promo}")
                else:
                    move_strs.append(usi)
            
            # Apply move
            try:
                m = shogi.Move.from_usi(usi)
                board.push(m)
            except:
                pass
        
        # Format movetext - ~80 chars per line
        movetext = ' '.join(move_strs)
        wrapped = []
        current_line = ""
        
        for word in movetext.split():
            if len(current_line) + len(word) + 1 > 80:
                wrapped.append(current_line)
                current_line = word
            else:
                current_line = f"{current_line} {word}".strip()
        
        if current_line:
            wrapped.append(current_line)
        
        lines.extend(wrapped)
        
        # Result at end
        lines.append(f" {record.metadata.result or '*'}")
        
        return '\n'.join(lines)
