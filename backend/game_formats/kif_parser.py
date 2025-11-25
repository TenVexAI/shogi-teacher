"""
KIF Format Parser and Exporter

KIF is a traditional Japanese shogi game record format.
"""

import re
import shogi
from datetime import datetime
from typing import Optional, List, Tuple
from .base import BaseParser, GameRecord, GameMetadata, ParsedMove


class KIFParser(BaseParser):
    """Parser for KIF format game records"""
    
    # Patterns for parsing
    MOVE_PATTERN = re.compile(
        r'^\s*(\d+)\s+([▲△])?\s*(\d)?([一二三四五六七八九])?(同)?'
        r'(歩|香|桂|銀|金|角|飛|玉|王|と|杏|成香|圭|成桂|全|成銀|馬|龍|竜)'
        r'(打|成|不成)?'
        r'(?:\((\d)(\d)\))?'
        r'(?:\s*\(\s*(\d+):(\d+)(?:/.*?)?\))?'
    )
    
    # Header patterns
    HEADER_PATTERNS = {
        '先手': 'black_name',
        '下手': 'black_name',
        '後手': 'white_name', 
        '上手': 'white_name',
        '開始日時': 'date',
        '終了日時': 'end_date',
        '棋戦': 'event',
        '場所': 'site',
        '手合割': 'handicap',
        '持ち時間': 'time_control',
        '戦型': 'opening',
    }
    
    def parse(self, content: str) -> GameRecord:
        """Parse KIF content into a GameRecord"""
        lines = content.split('\n')
        
        metadata = GameMetadata()
        moves = []
        comments = []
        in_moves = False
        
        # Track position for USI conversion
        board = shogi.Board()
        last_to_square = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Skip comments starting with #
            if line.startswith('#'):
                comments.append(line[1:].strip())
                continue
            
            # Parse headers
            if ':' in line and not in_moves:
                key, _, value = line.partition(':')
                key = key.strip()
                value = value.strip()
                
                if key in self.HEADER_PATTERNS:
                    attr = self.HEADER_PATTERNS[key]
                    if attr == 'date':
                        try:
                            metadata.date = datetime.strptime(value, '%Y/%m/%d %H:%M:%S')
                        except:
                            try:
                                metadata.date = datetime.strptime(value, '%Y/%m/%d')
                            except:
                                metadata.extra['date_raw'] = value
                    else:
                        setattr(metadata, attr, value)
                else:
                    metadata.extra[key] = value
                continue
            
            # Parse moves
            match = self.MOVE_PATTERN.match(line)
            if match:
                in_moves = True
                move_data = self._parse_move_match(match, board, last_to_square)
                if move_data:
                    move, last_to_square = move_data
                    moves.append(move)
                    # Apply move to board for tracking
                    try:
                        usi_move = shogi.Move.from_usi(move.move_usi)
                        board.push(usi_move)
                    except:
                        pass
            
            # Check for game end markers
            if '投了' in line or '中断' in line or '千日手' in line:
                break
        
        return GameRecord(
            metadata=metadata,
            moves=moves,
            starting_sfen=shogi.Board().sfen(),
            comments=comments
        )
    
    def _parse_move_match(self, match, board: shogi.Board, last_to_square: Optional[str]) -> Optional[Tuple[ParsedMove, str]]:
        """Parse a move match into a ParsedMove"""
        groups = match.groups()
        
        move_num = int(groups[0])
        player_marker = groups[1]  # ▲ or △
        dest_file = groups[2]  # Destination file (1-9)
        dest_rank = groups[3]  # Destination rank (一-九)
        is_same = groups[4]  # 同 (same square as last move)
        piece = groups[5]  # Piece name
        modifier = groups[6]  # 打/成/不成
        src_file = groups[7]  # Source file
        src_rank = groups[8]  # Source rank
        time_min = groups[9]
        time_sec = groups[10]
        
        # Determine player
        player = "black" if player_marker == '▲' or (move_num % 2 == 1 and not player_marker) else "white"
        
        # Convert piece
        usi_piece = self.piece_to_usi(piece)
        
        # Determine destination
        if is_same and last_to_square:
            to_square = last_to_square
        elif dest_file and dest_rank:
            to_square = self.japanese_coord_to_usi(int(dest_file), dest_rank)
        else:
            return None
        
        # Determine source/drop
        if modifier == '打':
            # Drop move
            drop_piece = usi_piece.lower() if player == "white" else usi_piece.upper()
            move_usi = f"{drop_piece[0]}*{to_square}"
        elif src_file and src_rank:
            # Move with explicit source
            from_square = f"{src_file}{chr(ord('a') + int(src_rank) - 1)}"
            promotion = '+' if modifier == '成' else ''
            move_usi = f"{from_square}{to_square}{promotion}"
        else:
            # Try to find source from legal moves
            move_usi = self._find_source_from_legal(board, usi_piece, to_square, modifier == '成')
            if not move_usi:
                return None
        
        # Calculate time
        time_spent = 0.0
        if time_min and time_sec:
            time_spent = int(time_min) * 60 + int(time_sec)
        
        # Build Japanese notation
        prefix = '▲' if player == "black" else '△'
        japanese = f"{prefix}{dest_file or ''}{dest_rank or ''}{is_same or ''}{piece}{modifier or ''}"
        
        return ParsedMove(
            move_number=move_num,
            player=player,
            move_usi=move_usi,
            move_japanese=japanese,
            time_spent=time_spent
        ), to_square
    
    def _find_source_from_legal(self, board: shogi.Board, piece: str, to_square: str, promotes: bool) -> Optional[str]:
        """Find source square from legal moves"""
        to_idx = self._square_to_index(to_square)
        if to_idx is None:
            return None
        
        for move in board.legal_moves:
            if move.to_square == to_idx:
                from_piece = board.piece_at(move.from_square)
                if from_piece:
                    piece_char = from_piece.symbol().upper()
                    if '+' in piece:
                        piece_char = '+' + piece_char
                    if piece_char == piece or piece_char == piece.upper():
                        promotion = '+' if promotes or move.promotion else ''
                        return f"{self._index_to_square(move.from_square)}{to_square}{promotion}"
        
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
        """Export GameRecord to KIF format"""
        lines = []
        
        # Headers
        if record.metadata.date:
            lines.append(f"開始日時:{record.metadata.date.strftime('%Y/%m/%d %H:%M:%S')}")
        if record.metadata.event:
            lines.append(f"棋戦:{record.metadata.event}")
        if record.metadata.site:
            lines.append(f"場所:{record.metadata.site}")
        
        lines.append(f"手合割:{record.metadata.handicap}")
        lines.append(f"先手:{record.metadata.black_name}")
        lines.append(f"後手:{record.metadata.white_name}")
        lines.append("")
        
        # Moves
        board = shogi.Board(record.starting_sfen)
        last_to = None
        
        for move in record.moves:
            prefix = "▲" if move.player == "black" else "△"
            
            # Parse USI move
            usi = move.move_usi
            if '*' in usi:
                # Drop
                piece = usi[0].upper()
                to_sq = usi[2:4]
                jp_piece = self.usi_to_piece(piece)
                file, rank = self.usi_to_japanese_coord(to_sq)
                move_str = f"{prefix}{file}{rank}{jp_piece}打"
            else:
                from_sq = usi[0:2]
                to_sq = usi[2:4]
                promotes = usi.endswith('+')
                
                # Get piece at source
                from_idx = self._square_to_index(from_sq)
                piece = board.piece_at(from_idx)
                if piece:
                    jp_piece = self.usi_to_piece(piece.symbol().upper())
                else:
                    jp_piece = '?'
                
                file, rank = self.usi_to_japanese_coord(to_sq)
                
                # Check if same square
                if to_sq == last_to:
                    move_str = f"{prefix}同{jp_piece}"
                else:
                    move_str = f"{prefix}{file}{rank}{jp_piece}"
                
                if promotes:
                    move_str += "成"
                
                # Add source for disambiguation
                move_str += f"({from_sq[0]}{ord(from_sq[1]) - ord('a') + 1})"
            
            # Add time if available
            if move.time_spent > 0:
                mins = int(move.time_spent) // 60
                secs = int(move.time_spent) % 60
                lines.append(f"{move.move_number:4d} {move_str}   ({mins:02d}:{secs:02d})")
            else:
                lines.append(f"{move.move_number:4d} {move_str}")
            
            # Apply move
            try:
                m = shogi.Move.from_usi(usi)
                board.push(m)
                last_to = to_sq
            except:
                pass
        
        return '\n'.join(lines)
