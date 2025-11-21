"""
USI Protocol Implementation

Handles USI (Universal Shogi Interface) protocol communication.
"""

import re
from dataclasses import dataclass
from typing import Optional, List


@dataclass
class USIOption:
    """Represents a USI option reported by the engine"""
    name: str
    type: str  # spin, check, combo, button, string
    default: str
    min: Optional[int] = None
    max: Optional[int] = None
    var: List[str] = None  # For combo type
    
    def __post_init__(self):
        if self.var is None:
            self.var = []


class USIProtocol:
    """Helper class for parsing and formatting USI protocol messages"""
    
    @staticmethod
    def parse_option(line: str) -> Optional[USIOption]:
        """
        Parse an 'option' line from engine output.
        
        Example:
            option name Hash type spin default 256 min 1 max 33554432
            option name UCI_LimitStrength type check default false
            option name Skill Level type spin default 20 min 0 max 20
        
        Args:
            line: The option line from engine
            
        Returns:
            USIOption object or None if parsing fails
        """
        if not line.startswith("option name "):
            return None
        
        try:
            # Remove "option name " prefix
            content = line[12:].strip()
            
            # Parse name (everything up to "type")
            type_idx = content.find(" type ")
            if type_idx == -1:
                return None
            
            name = content[:type_idx].strip()
            content = content[type_idx + 6:].strip()  # Skip " type "
            
            # Parse type
            parts = content.split()
            if not parts:
                return None
            
            option_type = parts[0]
            rest = " ".join(parts[1:])
            
            # Parse remaining attributes
            default = None
            min_val = None
            max_val = None
            var_list = []
            
            # Parse default
            default_match = re.search(r'default\s+(\S+)', rest)
            if default_match:
                default = default_match.group(1)
            
            # Parse min/max for spin type
            if option_type == "spin":
                min_match = re.search(r'min\s+(-?\d+)', rest)
                max_match = re.search(r'max\s+(-?\d+)', rest)
                if min_match:
                    min_val = int(min_match.group(1))
                if max_match:
                    max_val = int(max_match.group(1))
            
            # Parse var for combo type
            if option_type == "combo":
                var_matches = re.findall(r'var\s+(\S+)', rest)
                var_list = var_matches
            
            return USIOption(
                name=name,
                type=option_type,
                default=default or "",
                min=min_val,
                max=max_val,
                var=var_list
            )
            
        except Exception as e:
            print(f"Warning: Failed to parse option line: {line} - {e}")
            return None
    
    @staticmethod
    def format_setoption(name: str, value: str) -> str:
        """
        Format a setoption command.
        
        Args:
            name: Option name
            value: Option value
            
        Returns:
            Formatted command string
        """
        return f"setoption name {name} value {value}"
    
    @staticmethod
    def format_position(sfen: str, moves: List[str] = None) -> str:
        """
        Format a position command.
        
        Args:
            sfen: Position in SFEN format (or "startpos")
            moves: List of moves in USI format
            
        Returns:
            Formatted command string
        """
        if sfen == "startpos" or sfen.startswith("startpos"):
            cmd = "position startpos"
        else:
            cmd = f"position sfen {sfen}"
        
        if moves:
            cmd += " moves " + " ".join(moves)
        
        return cmd
    
    @staticmethod
    def format_go(
        btime: Optional[int] = None,
        wtime: Optional[int] = None,
        binc: Optional[int] = None,
        winc: Optional[int] = None,
        byoyomi: Optional[int] = None,
        movetime: Optional[int] = None,
        depth: Optional[int] = None,
        nodes: Optional[int] = None,
        infinite: bool = False
    ) -> str:
        """
        Format a go command with time control parameters.
        
        Args:
            btime: Black time remaining in milliseconds
            wtime: White time remaining in milliseconds
            binc: Black increment per move in milliseconds
            winc: White increment per move in milliseconds
            byoyomi: Byoyomi time in milliseconds
            movetime: Time to search in milliseconds
            depth: Search depth limit
            nodes: Node count limit
            infinite: Search until 'stop' command
            
        Returns:
            Formatted command string
        """
        parts = ["go"]
        
        if infinite:
            parts.append("infinite")
        else:
            if btime is not None:
                parts.extend(["btime", str(btime)])
            if wtime is not None:
                parts.extend(["wtime", str(wtime)])
            if binc is not None:
                parts.extend(["binc", str(binc)])
            if winc is not None:
                parts.extend(["winc", str(winc)])
            if byoyomi is not None:
                parts.extend(["byoyomi", str(byoyomi)])
            if movetime is not None:
                parts.extend(["movetime", str(movetime)])
            if depth is not None:
                parts.extend(["depth", str(depth)])
            if nodes is not None:
                parts.extend(["nodes", str(nodes)])
        
        return " ".join(parts)
    
    @staticmethod
    def parse_bestmove(line: str) -> tuple[Optional[str], Optional[str]]:
        """
        Parse a bestmove response.
        
        Example:
            bestmove 7g7f ponder 3c3d
            bestmove resign
        
        Args:
            line: The bestmove line
            
        Returns:
            Tuple of (bestmove, ponder_move) or (None, None) if parsing fails
        """
        if not line.startswith("bestmove "):
            return None, None
        
        parts = line.split()
        if len(parts) < 2:
            return None, None
        
        bestmove = parts[1]
        ponder = None
        
        if len(parts) >= 4 and parts[2] == "ponder":
            ponder = parts[3]
        
        return bestmove, ponder
    
    @staticmethod
    def parse_info(line: str) -> dict:
        """
        Parse an info line from engine output.
        
        Example:
            info depth 12 score cp 45 nodes 125000 nps 50000 pv 2g2f 8c8d
            info depth 10 score mate 5
        
        Args:
            line: The info line
            
        Returns:
            Dictionary with parsed info (depth, score_cp, mate, nodes, nps, pv, etc.)
        """
        if not line.startswith("info "):
            return {}
        
        info = {}
        parts = line.split()
        
        i = 1  # Skip "info"
        while i < len(parts):
            key = parts[i]
            
            if key == "depth" and i + 1 < len(parts):
                info["depth"] = int(parts[i + 1])
                i += 2
            elif key == "seldepth" and i + 1 < len(parts):
                info["seldepth"] = int(parts[i + 1])
                i += 2
            elif key == "score" and i + 2 < len(parts):
                score_type = parts[i + 1]
                score_value = parts[i + 2]
                if score_type == "cp":
                    info["score_cp"] = int(score_value)
                elif score_type == "mate":
                    info["mate"] = int(score_value)
                i += 3
            elif key == "nodes" and i + 1 < len(parts):
                info["nodes"] = int(parts[i + 1])
                i += 2
            elif key == "nps" and i + 1 < len(parts):
                info["nps"] = int(parts[i + 1])
                i += 2
            elif key == "time" and i + 1 < len(parts):
                info["time"] = int(parts[i + 1])
                i += 2
            elif key == "hashfull" and i + 1 < len(parts):
                info["hashfull"] = int(parts[i + 1])
                i += 2
            elif key == "pv":
                # PV is all remaining moves
                info["pv"] = parts[i + 1:]
                break
            else:
                i += 1
        
        return info
