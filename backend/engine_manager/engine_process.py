"""
Engine Process Management

Handles individual engine process lifecycle and communication.
"""

import subprocess
import threading
import time
from enum import Enum
from typing import Optional, List, Dict, Callable
from .engine_config import EngineConfig
from .usi_protocol import USIProtocol, USIOption


class EngineState(Enum):
    """Engine process state"""
    IDLE = "idle"
    INITIALIZING = "initializing"
    READY = "ready"
    THINKING = "thinking"
    ERROR = "error"


class EngineProcess:
    """
    Manages a single engine process and USI communication.
    """
    
    def __init__(self, config: EngineConfig):
        """
        Initialize engine process manager.
        
        Args:
            config: Engine configuration
        """
        self.config = config
        self.process: Optional[subprocess.Popen] = None
        self.state = EngineState.IDLE
        self.usi_options: List[USIOption] = []
        self.current_options: Dict[str, str] = {}
        self.lock = threading.Lock()
        
        # Engine info from USI
        self.engine_name: Optional[str] = None
        self.engine_author: Optional[str] = None
    
    def start(self, timeout: float = 10.0) -> None:
        """
        Start the engine process and initialize USI protocol.
        
        Args:
            timeout: Timeout in seconds for initialization
            
        Raises:
            FileNotFoundError: If engine executable not found
            RuntimeError: If engine fails to start
            TimeoutError: If initialization times out
        """
        with self.lock:
            if self.process is not None:
                return  # Already started
            
            self.state = EngineState.INITIALIZING
            
            try:
                # Start process
                print(f"[DEBUG] Starting {self.config.name}...")
                print(f"[DEBUG] Executable: {self.config.executablePath}")
                self.process = subprocess.Popen(
                    self.config.executablePath,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,  # Redirect stderr to stdout
                    universal_newlines=True,
                    bufsize=1,
                    cwd=self.config.engineDir
                )
                print(f"[DEBUG] Process started, PID: {self.process.pid}")
                
                # Send USI command
                print(f"[DEBUG] Sending 'usi' command...")
                self._send_command("usi")
                
                # Parse USI response
                print(f"[DEBUG] Waiting for USI response...")
                start_time = time.time()
                lines_received = 0
                while time.time() - start_time < timeout:
                    line = self._read_line(timeout=0.5)
                    if line is None:
                        continue
                    
                    lines_received += 1
                    if lines_received <= 3:  # Log first 3 lines
                        print(f"[DEBUG] Engine: {line}")
                    
                    if line.startswith("id name "):
                        self.engine_name = line[8:].strip()
                    elif line.startswith("id author "):
                        self.engine_author = line[10:].strip()
                    elif line.startswith("option "):
                        option = USIProtocol.parse_option(line)
                        if option:
                            self.usi_options.append(option)
                    elif line == "usiok":
                        print(f"[DEBUG] Received usiok after {lines_received} lines")
                        break
                else:
                    print(f"[DEBUG] TIMEOUT: No usiok after {timeout}s ({lines_received} lines received)")
                    raise TimeoutError(f"Engine did not respond with 'usiok' after {timeout}s")
                
                # Apply default options from config
                print(f"[DEBUG] Applying {len(self.config.defaultOptions)} default options...")
                for name, value in self.config.defaultOptions.items():
                    print(f"[DEBUG] Setting: {name} = {value}")
                    self.set_option(name, value)
                    time.sleep(0.05)  # Small delay between options
                
                # Drain any pending output from setoption commands
                # Just wait - engines don't output anything for setoption
                print(f"[DEBUG] Waiting 1s after options...")
                time.sleep(1.0)
                
                # Send isready and wait for readyok
                print(f"[DEBUG] Sending 'isready' command...")
                self._send_command("isready")
                print(f"[DEBUG] Waiting for 'readyok' (may take time to load eval/model files)...")
                if not self._wait_for("readyok", timeout=60.0):  # Increased to 60s for GPU engines with neural networks
                    print(f"[DEBUG] TIMEOUT: No readyok after 60s")
                    raise TimeoutError("Engine did not respond with 'readyok'")
                
                print(f"[DEBUG] Received readyok!")
                self.state = EngineState.READY
                print(f"✓ Engine started: {self.config.name}")
                
            except Exception as e:
                self.state = EngineState.ERROR
                self.stop()
                raise RuntimeError(f"Failed to start engine: {e}")
    
    def stop(self) -> None:
        """Stop the engine process gracefully."""
        with self.lock:
            if self.process is None:
                return
            
            try:
                # Try graceful shutdown
                self._send_command("quit")
                self.process.wait(timeout=2.0)
            except (subprocess.TimeoutExpired, Exception):
                # Force kill if graceful shutdown fails
                try:
                    self.process.kill()
                    self.process.wait(timeout=1.0)
                except Exception:
                    pass
            finally:
                self.process = None
                self.state = EngineState.IDLE
                print(f"✓ Engine stopped: {self.config.name}")
    
    def set_option(self, name: str, value: str) -> None:
        """
        Set a USI option.
        
        Args:
            name: Option name
            value: Option value (as string)
        """
        cmd = USIProtocol.format_setoption(name, value)
        self._send_command(cmd)
        self.current_options[name] = value
    
    def new_game(self) -> None:
        """Send 'usinewgame' command."""
        self._send_command("usinewgame")
    
    def set_position(self, sfen: str, moves: List[str] = None) -> None:
        """
        Set board position.
        
        Args:
            sfen: Position in SFEN format or "startpos"
            moves: List of moves in USI format
        """
        cmd = USIProtocol.format_position(sfen, moves)
        self._send_command(cmd)
    
    def go(
        self,
        btime: Optional[int] = None,
        wtime: Optional[int] = None,
        binc: Optional[int] = None,
        winc: Optional[int] = None,
        byoyomi: Optional[int] = None,
        movetime: Optional[int] = None,
        depth: Optional[int] = None,
        nodes: Optional[int] = None,
        callback: Optional[Callable[[str], None]] = None
    ) -> tuple[Optional[str], Optional[str], Dict]:
        """
        Start engine thinking and wait for bestmove.
        
        Args:
            btime: Black time in milliseconds
            wtime: White time in milliseconds
            binc: Black increment in milliseconds
            winc: White increment in milliseconds
            byoyomi: Byoyomi time in milliseconds
            movetime: Fixed time per move in milliseconds
            depth: Maximum search depth
            nodes: Maximum nodes to search
            callback: Optional callback for info lines
            
        Returns:
            Tuple of (bestmove, ponder, info_dict)
        """
        self.state = EngineState.THINKING
        
        cmd = USIProtocol.format_go(
            btime=btime,
            wtime=wtime,
            binc=binc,
            winc=winc,
            byoyomi=byoyomi,
            movetime=movetime,
            depth=depth,
            nodes=nodes
        )
        self._send_command(cmd)
        
        # Collect info lines
        best_info = {}
        
        while True:
            line = self._read_line(timeout=60.0)
            if line is None:
                continue
            
            if line.startswith("info "):
                info = USIProtocol.parse_info(line)
                if info:
                    best_info.update(info)
                    if callback:
                        callback(line)
            
            elif line.startswith("bestmove "):
                bestmove, ponder = USIProtocol.parse_bestmove(line)
                self.state = EngineState.READY
                return bestmove, ponder, best_info
        
        self.state = EngineState.READY
        return None, None, {}
    
    def stop_thinking(self) -> None:
        """Send 'stop' command to interrupt thinking."""
        self._send_command("stop")
    
    def _send_command(self, command: str) -> None:
        """
        Send a command to the engine.
        
        Args:
            command: USI command string
        """
        if self.process is None or self.process.stdin is None:
            raise RuntimeError("Engine not started")
        
        if self.process.poll() is not None:
            raise RuntimeError(f"Engine process terminated with code {self.process.poll()}")
        
        try:
            self.process.stdin.write(f"{command}\n")
            self.process.stdin.flush()
        except Exception as e:
            self.state = EngineState.ERROR
            raise RuntimeError(f"Failed to send command: {e}")
    
    def _read_line(self, timeout: float = 1.0) -> Optional[str]:
        """
        Read a line from engine stdout with timeout.
        Simple blocking read - works reliably on Windows.
        
        Args:
            timeout: Timeout in seconds (note: actual read is blocking)
            
        Returns:
            Line string or None if error
        """
        if self.process is None or self.process.stdout is None:
            return None
        
        try:
            # Simple blocking readline - this works!
            # The test script proved this approach is reliable
            line = self.process.stdout.readline()
            if line:
                return line.strip()
        except Exception:
            pass
        
        return None
    
    def _wait_for(self, target: str, timeout: float = 5.0) -> bool:
        """
        Wait for a specific response from engine.
        
        Args:
            target: Target string to wait for
            timeout: Timeout in seconds
            
        Returns:
            True if target received, False if timeout
        """
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            line = self._read_line(timeout=0.1)
            if line and (line == target or line.startswith(target)):
                return True
        
        return False
    
    def is_alive(self) -> bool:
        """Check if engine process is alive."""
        return self.process is not None and self.process.poll() is None
    
    def get_option(self, name: str) -> Optional[USIOption]:
        """
        Get a USI option by name.
        
        Args:
            name: Option name
            
        Returns:
            USIOption or None if not found
        """
        for option in self.usi_options:
            if option.name == name:
                return option
        return None
