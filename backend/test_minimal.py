import subprocess
import os

# Direct test - minimal code to see what's happening
engine_path = r"C:\Users\gt3r390\Documents\GitHub\shogi-teacher\backend\engine\YaneuraOu.exe"

print("Creating process...")
process = subprocess.Popen(
    engine_path,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    universal_newlines=True,
    bufsize=1
)

print("Sending usi...")
process.stdin.write("usi\n")
process.stdin.flush()

# Read until usiok
while True:
    line = process.stdout.readline().strip()
    print(f"< {line}")
    if line == "usiok":
        break

print("\nSending isready...")
process.stdin.write("isready\n")
process.stdin.flush()

while True:
    line = process.stdout.readline().strip()
    print(f"< {line}")
    if line == "readyok":
        break

print("\nNow trying usinewgame...")
print(f"stdin closed? {process.stdin.closed}")
print(f"process poll: {process.poll()}")

try:
    process.stdin.write("usinewgame\n")
    process.stdin.flush()
    print("✓ usinewgame sent successfully!")
    
    process.stdin.write("position startpos\n")
    process.stdin.flush()
    print("✓ position sent successfully!")
    
    process.stdin.write("go btime 1000 wtime 1000 byoyomi 0\n")
    process.stdin.flush()
    print("✓ go sent successfully!")
    
    # Read bestmove
    while True:
        line = process.stdout.readline().strip()
        print(f"< {line}")
        if line.startswith("bestmove"):
            print(f"\n✓ SUCCESS! Got: {line}")
            break
            
except Exception as e:
    print(f"\n✗ FAILED: {type(e).__name__}: {e}")
    print(f"stdin closed? {process.stdin.closed}")
    print(f"process poll: {process.poll()}")

process.stdin.write("quit\n")
process.stdin.flush()
process.wait()
