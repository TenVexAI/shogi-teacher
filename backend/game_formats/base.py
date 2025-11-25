"""
Base classes for game format parsing.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List, Dict, Any


@dataclass
class GameMetadata:
    """Game metadata from file headers"""
    white_name: str = "Guest"  # 後手/Gote
    black_name: str = "Guest"  # 先手/Sente
    event: str = ""
    site: str = ""
    date: Optional[datetime] = None
    round: str = ""
    result: str = ""  # "1-0", "0-1", "1/2-1/2", "*"
    time_control: str = ""
    opening: str = ""
    handicap: str = "平手"  # Even game
    extra: Dict[str, str] = field(default_factory=dict)


@dataclass 
class ParsedMove:
    """A single parsed move"""
    move_number: int
    player: str  # "black" or "white"
    move_usi: str  # USI format (e.g., "7g7f")
    move_japanese: str = ""  # Japanese notation (e.g., "▲7六歩")
    move_algebraic: str = ""  # Algebraic notation (e.g., "P-7f")
    time_spent: float = 0.0  # seconds
    comment: str = ""


@dataclass
class GameRecord:
    """Complete parsed game record"""
    metadata: GameMetadata
    moves: List[ParsedMove]
    starting_sfen: str = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
    comments: List[str] = field(default_factory=list)  # Game-level comments


class BaseParser:
    """Base class for game format parsers"""
    
    def parse(self, content: str) -> GameRecord:
        """Parse content into a GameRecord"""
        raise NotImplementedError
    
    def export(self, record: GameRecord) -> str:
        """Export a GameRecord to format string"""
        raise NotImplementedError
    
    # === Coordinate conversion utilities ===
    
    # Japanese number characters for ranks (1-9)
    JAPANESE_NUMBERS = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
    
    # Japanese piece names
    JAPANESE_PIECES = {
        '歩': 'P', '香': 'L', '桂': 'N', '銀': 'S', 
        '金': 'G', '角': 'B', '飛': 'R', '玉': 'K', '王': 'K',
        'と': '+P', '杏': '+L', '成香': '+L', '圭': '+N', '成桂': '+N',
        '全': '+S', '成銀': '+S', '馬': '+B', '龍': '+R', '竜': '+R',
    }
    
    # Reverse mapping
    PIECE_TO_JAPANESE = {
        'P': '歩', 'L': '香', 'N': '桂', 'S': '銀',
        'G': '金', 'B': '角', 'R': '飛', 'K': '玉',
        '+P': 'と', '+L': '杏', '+N': '圭', '+S': '全',
        '+B': '馬', '+R': '龍',
    }
    
    def japanese_coord_to_usi(self, file_num: int, rank_jp: str) -> str:
        """
        Convert Japanese coordinates to USI format.
        
        Args:
            file_num: File number (1-9, right to left)
            rank_jp: Japanese rank character (一-九)
            
        Returns:
            USI square string (e.g., "7f")
        """
        rank_idx = self.JAPANESE_NUMBERS.index(rank_jp)
        rank_char = chr(ord('a') + rank_idx)
        return f"{file_num}{rank_char}"
    
    def usi_to_japanese_coord(self, usi_square: str) -> tuple:
        """
        Convert USI square to Japanese coordinates.
        
        Args:
            usi_square: USI square string (e.g., "7f")
            
        Returns:
            (file_num, rank_japanese) tuple
        """
        file_num = int(usi_square[0])
        rank_idx = ord(usi_square[1]) - ord('a')
        rank_jp = self.JAPANESE_NUMBERS[rank_idx]
        return file_num, rank_jp
    
    def piece_to_usi(self, japanese_piece: str) -> str:
        """Convert Japanese piece name to USI piece character"""
        return self.JAPANESE_PIECES.get(japanese_piece, japanese_piece)
    
    def usi_to_piece(self, usi_piece: str) -> str:
        """Convert USI piece character to Japanese name"""
        return self.PIECE_TO_JAPANESE.get(usi_piece, usi_piece)
