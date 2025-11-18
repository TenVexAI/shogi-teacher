import asyncio
import subprocess
import os
from typing import Optional, Tuple, List

class ShogiEngine:
    def __init__(self, engine_path: str):
        self.engine_path = engine_path
        self.process: Optional[asyncio.subprocess.Process] = None
        self.lock = asyncio.Lock()

    async def start(self):
        if self.process:
            return

        # Check if engine file exists
        if not os.path.exists(self.engine_path):
            error_msg = f"Engine not found at: {self.engine_path}"
            print(error_msg)
            raise FileNotFoundError(error_msg)

        try:
            print(f"Starting engine: {self.engine_path}")
            self.process = await asyncio.create_subprocess_exec(
                self.engine_path,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            
            await self._send_command("usi")
            await self._wait_for_output("usiok")
            await self._send_command("isready")
            await self._wait_for_output("readyok")
            print(f"Engine started successfully: {self.engine_path}")
            
        except FileNotFoundError as e:
            print(f"Engine file not found: {e}")
            raise
        except Exception as e:
            print(f"Error starting engine: {e}")
            if self.process and self.process.stderr:
                stderr = await self.process.stderr.read()
                print(f"Engine stderr: {stderr.decode()}")
            raise

    async def stop(self):
        if self.process:
            await self._send_command("quit")
            try:
                await asyncio.wait_for(self.process.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                self.process.kill()
            self.process = None

    async def _send_command(self, command: str):
        if not self.process or not self.process.stdin:
            raise RuntimeError("Engine not running")
        
        # print(f"> {command}")
        self.process.stdin.write(f"{command}\n".encode())
        await self.process.stdin.drain()

    async def _wait_for_output(self, target: str) -> str:
        if not self.process or not self.process.stdout:
            raise RuntimeError("Engine not running")

        while True:
            line_bytes = await self.process.stdout.readline()
            if not line_bytes:
                break
            line = line_bytes.decode().strip()
            # print(f"< {line}")
            if line == target or line.startswith(target):
                return line
        return ""

    async def analyze(self, sfen: str, time_limit: int = 1000) -> dict:
        """
        Analyze a position and return bestmove and evaluation.
        """
        async with self.lock:
            if not self.process:
                await self.start()

            await self._send_command("usinewgame")
            await self._send_command(f"position sfen {sfen}")
            await self._send_command(f"go btime {time_limit} wtime {time_limit} byoyomi 0")

            best_move = ""
            info_line = ""
            
            if not self.process or not self.process.stdout:
                 raise RuntimeError("Engine died during analysis")

            while True:
                line_bytes = await self.process.stdout.readline()
                if not line_bytes:
                    break
                line = line_bytes.decode().strip()
                # print(f"< {line}")
                
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
                        type_ = parts[idx+1] # cp or mate
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

