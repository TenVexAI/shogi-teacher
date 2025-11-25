"""
Game Format Parsers and Exporters

Supports KIF, CSA, KI2, and PSN formats for shogi game records.
"""

from .base import GameRecord, ParsedMove, GameMetadata
from .kif_parser import KIFParser
from .csa_parser import CSAParser
from .ki2_parser import KI2Parser
from .psn_parser import PSNParser

__all__ = [
    'GameRecord',
    'ParsedMove', 
    'GameMetadata',
    'KIFParser',
    'CSAParser',
    'KI2Parser',
    'PSNParser',
    'parse_game_file',
    'export_game_file',
    'detect_format',
]


def detect_format(content: str) -> str:
    """
    Detect the format of a game record.
    
    Args:
        content: File content as string
        
    Returns:
        Format string: 'kif', 'csa', 'ki2', or 'psn'
    """
    content_lower = content.lower().strip()
    
    # CSA format starts with version or player info
    if content_lower.startswith('v2') or content_lower.startswith("n+") or content_lower.startswith("n-"):
        return 'csa'
    
    # PSN format has [Event or similar headers
    if content_lower.startswith('['):
        return 'psn'
    
    # KIF format typically has 開始日時 or 手合割
    if '開始日時' in content or '手合割' in content or '先手' in content:
        # KI2 uses same metadata but different move format
        # KI2 moves are like "▲7六歩" without move numbers
        lines = content.split('\n')
        for line in lines:
            line = line.strip()
            if line and line[0].isdigit() and ('▲' in line or '△' in line):
                return 'kif'
        # Check for KI2-style moves (starts with ▲ or △)
        for line in lines:
            line = line.strip()
            if line.startswith('▲') or line.startswith('△'):
                return 'ki2'
        return 'kif'  # Default to KIF if has Japanese metadata
    
    # Default to KIF
    return 'kif'


def parse_game_file(content: str, format: str = None) -> GameRecord:
    """
    Parse a game file into a GameRecord.
    
    Args:
        content: File content as string
        format: Format string ('kif', 'csa', 'ki2', 'psn') or None to auto-detect
        
    Returns:
        Parsed GameRecord
    """
    if format is None:
        format = detect_format(content)
    
    parsers = {
        'kif': KIFParser,
        'csa': CSAParser,
        'ki2': KI2Parser,
        'psn': PSNParser,
    }
    
    parser_class = parsers.get(format.lower())
    if not parser_class:
        raise ValueError(f"Unknown format: {format}")
    
    parser = parser_class()
    return parser.parse(content)


def export_game_file(record: GameRecord, format: str, 
                     white_name: str = None, black_name: str = None,
                     event: str = None) -> str:
    """
    Export a GameRecord to a specific format.
    
    Args:
        record: GameRecord to export
        format: Target format ('kif', 'csa', 'ki2', 'psn')
        white_name: Override white player name
        black_name: Override black player name
        event: Event name for export
        
    Returns:
        Exported content as string
    """
    # Override names if provided
    if white_name:
        record.metadata.white_name = white_name
    if black_name:
        record.metadata.black_name = black_name
    if event:
        record.metadata.event = event
    
    exporters = {
        'kif': KIFParser,
        'csa': CSAParser,
        'ki2': KI2Parser,
        'psn': PSNParser,
    }
    
    exporter_class = exporters.get(format.lower())
    if not exporter_class:
        raise ValueError(f"Unknown format: {format}")
    
    exporter = exporter_class()
    return exporter.export(record)
