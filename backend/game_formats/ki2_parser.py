"""
KI2 Format Parser and Exporter

KI2 is a simplified KIF variant commonly used for displaying games.
Moves are written without numbers, multiple moves per line possible.
"""

import re
import shogi
from datetime import datetime
from typing import Optional, List, Tuple
from .base import BaseParser, GameRecord, GameMetadata, ParsedMove


class KI2Parser(BaseParser):
    """Parser for KI2 format game records"""
    
    # Pattern for a single KI2 move
    MOVE_PATTERN = re.compile(
        r'([▲△])'  # Player marker
        r'(\d)?([一二三四五六七八九])?(同)?'  # Destination
        r'(歩|香|桂|銀|金|角|飛|玉|王|と|杏|成香|圭|成桂|全|成銀|馬|龍|竜)'  # Piece
        r'([上下右左直寄引])*'  # Movement direction disambiguation
        r'(打|成|不成)?'  # Modifier
    )
    
    # Header patterns (same as KIF)
    HEADER_PATTERNS = {
        '先手': 'black_name',
        '下手': 'black_name',
        '後手': 'white_name',
        '上手': 'white_name',
        '開始日時': 'date',
        '棋戦': 'event',
        '場所': 'site',
        '手合割': 'handicap',
        '持ち時間': 'time_control',
        '戦型': 'opening',
    }
    
    def parse(self, content: str) -> GameRecord:
        """Parse KI2 content into a GameRecord"""
        lines = content.split('\n')
        
        metadata = GameMetadata()
        moves = []
        comments = []
        in_moves = False
        
        board = shogi.Board()
        last_to_square = None
        move_num = 0
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Skip comments
            if line.startswith('#') or line.startswith('*'):
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
            
            # Parse moves - KI2 can have multiple moves per line
            for match in self.MOVE_PATTERN.finditer(line):
                in_moves = True
                move_num += 1
                
                result = self._parse_move_match(match, board, last_to_square, move_num)
                if result:
                    move, last_to_square = result
                    moves.append(move)
                    # Apply move
                    try:
                        m = shogi.Move.from_usi(move.move_usi)
                        board.push(m)
                    except:
                        pass
            
            # Check for game end
            if '投了' in line or '中断' in line or '千日手' in line:
                break
        
        return GameRecord(
            metadata=metadata,
            moves=moves,
            starting_sfen=shogi.Board().sfen(),
            comments=comments
        )
    
    def _parse_move_match(self, match, board: shogi.Board, last_to_square: Optional[str], move_num: int) -> Optional[Tuple[ParsedMove, str]]:
        """Parse a KI2 move match"""
        groups = match.groups()
        
        player_marker = groups[0]  # ▲ or △
        dest_file = groups[1]  # Destination file (1-9)
        dest_rank = groups[2]  # Destination rank (一-九)
        is_same = groups[3]  # 同 (same square)
        piece = groups[4]  # Piece name
        disambiguation = groups[5]  # Direction disambiguation
        modifier = groups[6]  # 打/成/不成
        
        player = "black" if player_marker == '▲' else "white"
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
            move_usi = f"{usi_piece[0]}*{to_square}"
        else:
            # Find source from legal moves with disambiguation
            move_usi = self._find_source_with_disambiguation(
                board, usi_piece, to_square, 
                modifier == '成', disambiguation
            )
            if not move_usi:
                return None
        
        # Build Japanese notation
        japanese = f"{player_marker}{dest_file or ''}{dest_rank or ''}{is_same or ''}{piece}{disambiguation or ''}{modifier or ''}"
        
        return ParsedMove(
            move_number=move_num,
            player=player,
            move_usi=move_usi,
            move_japanese=japanese,
        ), to_square
    
    def _find_source_with_disambiguation(self, board: shogi.Board, piece: str, to_square: str, promotes: bool, disambiguation: Optional[str]) -> Optional[str]:
        """Find source square considering disambiguation hints"""
        to_idx = self._square_to_index(to_square)
        if to_idx is None:
            return None
        
        candidates = []
        for move in board.legal_moves:
            if move.to_square == to_idx:
                from_piece = board.piece_at(move.from_square)
                if from_piece:
                    piece_char = from_piece.symbol().upper()
                    if '+' in piece:
                        piece_char = '+' + piece_char
                    if piece_char == piece or piece_char == piece.upper():
                        candidates.append(move)
        
        if len(candidates) == 0:
            return None
        
        if len(candidates) == 1:
            move = candidates[0]
            promotion = '+' if promotes or move.promotion else ''
            return f"{self._index_to_square(move.from_square)}{to_square}{promotion}"
        
        # Use disambiguation to select correct move
        if disambiguation:
            to_file = int(to_square[0])
            to_rank = ord(to_square[1]) - ord('a')
            
            for move in candidates:
                from_sq = self._index_to_square(move.from_square)
                from_file = int(from_sq[0])
                from_rank = ord(from_sq[1]) - ord('a')
                
                match = True
                for d in disambiguation if disambiguation else []:
                    if d == '上':  # Moving up (decreasing rank for black)
                        match = match and from_rank > to_rank
                    elif d == '下':  # Moving down
                        match = match and from_rank < to_rank
                    elif d == '右':  # From right
                        match = match and from_file < to_file
                    elif d == '左':  # From left
                        match = match and from_file > to_file
                    elif d == '直':  # Straight (same file)
                        match = match and from_file == to_file
                    elif d == '寄':  # Horizontal move
                        match = match and from_rank == to_rank
                    elif d == '引':  # Pulling back
                        match = match and from_rank < to_rank
                
                if match:
                    promotion = '+' if promotes or move.promotion else ''
                    return f"{from_sq}{to_square}{promotion}"
        
        # Default to first candidate
        if candidates:
            move = candidates[0]
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
        """Export GameRecord to KI2 format"""
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
        
        # Moves - group into lines of ~6 moves each
        board = shogi.Board(record.starting_sfen)
        last_to = None
        move_line = []
        
        for move in record.moves:
            prefix = "▲" if move.player == "black" else "△"
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
                
                from_idx = self._square_to_index(from_sq)
                piece = board.piece_at(from_idx)
                if piece:
                    jp_piece = self.usi_to_piece(piece.symbol().upper())
                else:
                    jp_piece = '?'
                
                file, rank = self.usi_to_japanese_coord(to_sq)
                
                if to_sq == last_to:
                    move_str = f"{prefix}同{jp_piece}"
                else:
                    move_str = f"{prefix}{file}{rank}{jp_piece}"
                
                if promotes:
                    move_str += "成"
            
            move_line.append(move_str)
            
            # Write line every 6 moves
            if len(move_line) >= 6:
                lines.append(' '.join(move_line))
                move_line = []
            
            # Apply move
            try:
                m = shogi.Move.from_usi(usi)
                board.push(m)
                last_to = to_sq if '*' not in usi else usi[2:4]
            except:
                pass
        
        # Write remaining moves
        if move_line:
            lines.append(' '.join(move_line))
        
        return '\n'.join(lines)
