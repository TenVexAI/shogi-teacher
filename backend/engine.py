import asyncio
import subprocess
import os
from typing import Optional, Tuple, List
from concurrent.futures import ThreadPoolExecutor
import threading

class ShogiEngine:
    def __init__(self, engine_path: str):
        self.engine_path = engine_path
        self.process: Optional[subprocess.Popen] = None
        self.lock = threading.Lock()
        self.executor = ThreadPoolExecutor(max_workers=1)

    async def start(self):
        """Start the engine asynchronously by running sync startup in thread pool."""
        if self.process:
            return
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self.executor, self._start_sync)
    
    def _start_sync(self):
        """Synchronous engine startup."""
        if self.process:
            return

        # Check if engine file exists
        if not os.path.exists(self.engine_path):
            error_msg = f"Engine not found at: {self.engine_path}"
            print(error_msg)
            raise FileNotFoundError(error_msg)

        try:
            print(f"Starting engine: {self.engine_path}")
            
            # Use universal_newlines for proper Windows text mode handling
            self.process = subprocess.Popen(
                self.engine_path,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                universal_newlines=True,
                bufsize=1
            )
            
            print("Sending 'usi' command...")
            self._send_command_sync("usi")
            print("Waiting for 'usiok' response...")
            response = self._wait_for_output_sync("usiok", timeout=5.0)
            print(f"Received: {response}")
            
            print("Sending 'isready' command...")
            self._send_command_sync("isready")
            print("Waiting for 'readyok' response...")
            response = self._wait_for_output_sync("readyok", timeout=5.0)
            print(f"Received: {response}")
            
            print(f"Engine started successfully: {self.engine_path}")
            
        except Exception as e:
            error_msg = f"Error starting engine: {type(e).__name__}: {str(e)}"
            print(error_msg)
            if self.process and self.process.stderr:
                try:
                    stderr = self.process.stderr.read()
                    print(f"Engine stderr: {stderr}")
                except:
                    pass
            self.process = None
            raise RuntimeError(error_msg)

    async def stop(self):
        if self.process:
            try:
                self._send_command_sync("quit")
                self.process.wait(timeout=2.0)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.process = None

    def _send_command_sync(self, command: str):
        if not self.process:
            raise RuntimeError("Engine process is None")
        if not self.process.stdin:
            raise RuntimeError("Engine stdin is None")
        if self.process.poll() is not None:
            raise RuntimeError(f"Engine process has terminated with code {self.process.poll()}")
        
        try:
            self.process.stdin.write(f"{command}\n")
            self.process.stdin.flush()
        except Exception as e:
            print(f"Error writing to stdin: {type(e).__name__}: {e}")
            print(f"Process poll: {self.process.poll()}")
            raise

    def _wait_for_output_sync(self, target: str, timeout: float = 5.0) -> str:
        if not self.process or not self.process.stdout:
            raise RuntimeError("Engine not running")

        import time
        start_time = time.time()
        
        while True:
            if time.time() - start_time > timeout:
                raise TimeoutError(f"Timeout waiting for '{target}'")
            
            line = self.process.stdout.readline()
            if not line:
                break
            line = line.strip()
            if line == target or line.startswith(target):
                return line
        return ""

    async def analyze(self, sfen: str, time_limit: int = 1000) -> dict:
        """
        Analyze a position and return bestmove and evaluation.
        """
        def _analyze_with_engine():
            with self.lock:
                # Start engine if not already started
                if not self.process:
                    if not os.path.exists(self.engine_path):
                        raise FileNotFoundError(f"Engine not found at: {self.engine_path}")
                    
                    print(f"Starting engine: {self.engine_path}")
                    self.process = subprocess.Popen(
                        self.engine_path,
                        stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        universal_newlines=True,
                        bufsize=1
                    )
                    
                    # Initialize engine
                    self._send_command_sync("usi")
                    self._wait_for_output_sync("usiok", timeout=5.0)
                    self._send_command_sync("isready")
                    self._wait_for_output_sync("readyok", timeout=5.0)
                    print(f"Engine initialized successfully")
                
                # Now analyze
                if not self.process:
                    raise RuntimeError("Engine not started")

                self._send_command_sync("usinewgame")
                self._send_command_sync(f"position sfen {sfen}")
                self._send_command_sync(f"go btime {time_limit} wtime {time_limit} byoyomi 0")

                best_move = ""
                info_line = ""
                
                if not self.process or not self.process.stdout:
                    raise RuntimeError("Engine died during analysis")

                while True:
                    line = self.process.stdout.readline()
                    if not line:
                        break
                    line = line.strip()
                    
                    if line.startswith("info") and "score" in line:
                        info_line = line
                    
                    if line.startswith("bestmove"):
                        parts = line.split()
                        if len(parts) > 1:
                            best_move = parts[1]
                        break
                
                # Parse info line for score (cp or mate)
                score = 0
                mate = None
                
                if info_line:
                    parts = info_line.split()
                    try:
                        if "score" in parts:
                            idx = parts.index("score")
                            type_ = parts[idx+1]
                            val = int(parts[idx+2])
                            if type_ == "mate":
                                mate = val
                            else:
                                score = val
                    except (ValueError, IndexError):
                        pass

                return {
                    "bestmove": best_move,
                    "score_cp": score,
                    "mate": mate,
                    "info": info_line
                }
        
        # Run in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.executor, _analyze_with_engine)

