"""
CSA Format Parser and Exporter

CSA is a computer-friendly shogi game record format used by the 
Computer Shogi Association.
"""

import re
import shogi
from datetime import datetime
from typing import Optional, List
from .base import BaseParser, GameRecord, GameMetadata, ParsedMove


class CSAParser(BaseParser):
    """Parser for CSA format game records"""
    
    # CSA piece mapping
    CSA_PIECES = {
        'FU': 'P', 'KY': 'L', 'KE': 'N', 'GI': 'S',
        'KI': 'G', 'KA': 'B', 'HI': 'R', 'OU': 'K',
        'TO': '+P', 'NY': '+L', 'NK': '+N', 'NG': '+S',
        'UM': '+B', 'RY': '+R',
    }
    
    CSA_TO_USI = {
        'FU': 'P', 'KY': 'L', 'KE': 'N', 'GI': 'S',
        'KI': 'G', 'KA': 'B', 'HI': 'R', 'OU': 'K',
        'TO': '+P', 'NY': '+L', 'NK': '+N', 'NG': '+S',
        'UM': '+B', 'RY': '+R',
    }
    
    USI_TO_CSA = {v: k for k, v in CSA_PIECES.items()}
    
    def parse(self, content: str) -> GameRecord:
        """Parse CSA content into a GameRecord"""
        lines = content.split('\n')
        
        metadata = GameMetadata()
        moves = []
        comments = []
        move_num = 0
        
        board = shogi.Board()
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Comments
            if line.startswith("'"):
                comments.append(line[1:])
                continue
            
            # Version
            if line.startswith('V'):
                continue
            
            # Player names
            if line.startswith('N+'):
                metadata.black_name = line[2:]
                continue
            if line.startswith('N-'):
                metadata.white_name = line[2:]
                continue
            
            # Game info
            if line.startswith('$'):
                key, _, value = line[1:].partition(':')
                if key == 'EVENT':
                    metadata.event = value
                elif key == 'SITE':
                    metadata.site = value
                elif key == 'START_TIME':
                    try:
                        metadata.date = datetime.strptime(value, '%Y/%m/%d %H:%M:%S')
                    except:
                        metadata.extra['start_time'] = value
                elif key == 'TIME_LIMIT':
                    metadata.time_control = value
                elif key == 'OPENING':
                    metadata.opening = value
                else:
                    metadata.extra[key] = value
                continue
            
            # Position indicator
            if line.startswith('P'):
                # Board position - skip for now, assume standard start
                continue
            
            # Turn indicator
            if line == '+' or line == '-':
                continue
            
            # Moves
            if line.startswith('+') or line.startswith('-'):
                move_data = self._parse_move(line, board, move_num + 1)
                if move_data:
                    moves.append(move_data)
                    move_num += 1
                    # Apply move
                    try:
                        m = shogi.Move.from_usi(move_data.move_usi)
                        board.push(m)
                    except:
                        pass
            
            # Time info (T followed by seconds)
            if line.startswith('T') and moves:
                try:
                    time_sec = int(line[1:])
                    moves[-1].time_spent = float(time_sec)
                except:
                    pass
            
            # Game end
            if line.startswith('%'):
                if 'TORYO' in line:
                    metadata.result = '1-0' if move_num % 2 == 0 else '0-1'
                elif 'SENNICHITE' in line:
                    metadata.result = '1/2-1/2'
                break
        
        return GameRecord(
            metadata=metadata,
            moves=moves,
            starting_sfen=shogi.Board().sfen(),
            comments=comments
        )
    
    def _parse_move(self, line: str, board: shogi.Board, move_num: int) -> Optional[ParsedMove]:
        """Parse a CSA move line"""
        player = "black" if line.startswith('+') else "white"
        move_str = line[1:]
        
        if len(move_str) < 6:
            return None
        
        from_sq = move_str[0:2]
        to_sq = move_str[2:4]
        piece = move_str[4:6]
        
        # Convert coordinates
        try:
            from_file = int(from_sq[0])
            from_rank = int(from_sq[1])
            to_file = int(to_sq[0])
            to_rank = int(to_sq[1])
        except:
            return None
        
        # Build USI move
        if from_file == 0 and from_rank == 0:
            # Drop move
            usi_piece = self.CSA_TO_USI.get(piece, piece[0])
            to_usi = f"{to_file}{chr(ord('a') + to_rank - 1)}"
            move_usi = f"{usi_piece[0]}*{to_usi}"
        else:
            # Regular move
            from_usi = f"{from_file}{chr(ord('a') + from_rank - 1)}"
            to_usi = f"{to_file}{chr(ord('a') + to_rank - 1)}"
            
            # Check for promotion
            from_idx = (9 - from_file) + (from_rank - 1) * 9
            current_piece = board.piece_at(from_idx)
            
            promotion = ''
            if current_piece:
                target_piece = self.CSA_TO_USI.get(piece, piece)
                current_symbol = current_piece.symbol().upper()
                if target_piece.startswith('+') and not current_symbol.startswith('+'):
                    promotion = '+'
            
            move_usi = f"{from_usi}{to_usi}{promotion}"
        
        return ParsedMove(
            move_number=move_num,
            player=player,
            move_usi=move_usi,
        )
    
    def export(self, record: GameRecord) -> str:
        """Export GameRecord to CSA format"""
        lines = []
        
        # Version
        lines.append("V2.2")
        
        # Player names
        lines.append(f"N+{record.metadata.black_name}")
        lines.append(f"N-{record.metadata.white_name}")
        
        # Game info
        if record.metadata.event:
            lines.append(f"$EVENT:{record.metadata.event}")
        if record.metadata.site:
            lines.append(f"$SITE:{record.metadata.site}")
        if record.metadata.date:
            lines.append(f"$START_TIME:{record.metadata.date.strftime('%Y/%m/%d %H:%M:%S')}")
        if record.metadata.time_control:
            lines.append(f"$TIME_LIMIT:{record.metadata.time_control}")
        if record.metadata.opening:
            lines.append(f"$OPENING:{record.metadata.opening}")
        
        # Starting position (standard)
        lines.append("P1-KY-KE-GI-KI-OU-KI-GI-KE-KY")
        lines.append("P2 * -HI *  *  *  *  * -KA * ")
        lines.append("P3-FU-FU-FU-FU-FU-FU-FU-FU-FU")
        lines.append("P4 *  *  *  *  *  *  *  *  * ")
        lines.append("P5 *  *  *  *  *  *  *  *  * ")
        lines.append("P6 *  *  *  *  *  *  *  *  * ")
        lines.append("P7+FU+FU+FU+FU+FU+FU+FU+FU+FU")
        lines.append("P8 * +KA *  *  *  *  * +HI * ")
        lines.append("P9+KY+KE+GI+KI+OU+KI+GI+KE+KY")
        lines.append("+")
        
        # Moves
        board = shogi.Board(record.starting_sfen)
        
        for move in record.moves:
            prefix = '+' if move.player == "black" else '-'
            usi = move.move_usi
            
            if '*' in usi:
                # Drop
                piece_char = usi[0].upper()
                csa_piece = self.USI_TO_CSA.get(piece_char, 'FU')
                to_sq = usi[2:4]
                to_file = int(to_sq[0])
                to_rank = ord(to_sq[1]) - ord('a') + 1
                lines.append(f"{prefix}00{to_file}{to_rank}{csa_piece}")
            else:
                # Regular move
                from_sq = usi[0:2]
                to_sq = usi[2:4]
                promotes = usi.endswith('+')
                
                from_file = int(from_sq[0])
                from_rank = ord(from_sq[1]) - ord('a') + 1
                to_file = int(to_sq[0])
                to_rank = ord(to_sq[1]) - ord('a') + 1
                
                # Get piece after move
                from_idx = (9 - from_file) + (from_rank - 1) * 9
                piece = board.piece_at(from_idx)
                if piece:
                    piece_char = piece.symbol().upper()
                    if promotes:
                        piece_char = '+' + piece_char
                    csa_piece = self.USI_TO_CSA.get(piece_char, 'FU')
                else:
                    csa_piece = 'FU'
                
                lines.append(f"{prefix}{from_file}{from_rank}{to_file}{to_rank}{csa_piece}")
            
            # Time spent
            if move.time_spent > 0:
                lines.append(f"T{int(move.time_spent)}")
            
            # Apply move
            try:
                m = shogi.Move.from_usi(usi)
                board.push(m)
            except:
                pass
        
        # Result
        if record.metadata.result == '1-0':
            lines.append("%TORYO")
        elif record.metadata.result == '0-1':
            lines.append("%TORYO")
        elif record.metadata.result == '1/2-1/2':
            lines.append("%SENNICHITE")
        
        return '\n'.join(lines)
