import subprocess
import os

# Check if eval file exists
eval_path = r"C:\Users\gt3r390\Documents\GitHub\shogi-teacher\backend\eval\nn.bin"
print(f"Checking for eval file: {eval_path}")
print(f"Exists: {os.path.exists(eval_path)}")

if not os.path.exists(eval_path):
    print("\n❌ nn.bin NOT FOUND!")
    print("You need to:")
    print("1. Download Suisho5 from https://github.com/yaneurao/YaneuraOu/releases")
    print("2. Extract nn.bin")
    print("3. Create backend/eval/ folder")
    print("4. Place nn.bin in backend/eval/nn.bin")
    exit(1)

# Test engine with eval file
engine_path = r"C:\Users\gt3r390\Documents\GitHub\shogi-teacher\backend\engine\YaneuraOu.exe"

print(f"\n✓ nn.bin found! Testing engine...")
print("="*50)

process = subprocess.Popen(
    engine_path,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    universal_newlines=True,
    bufsize=1,
    cwd=r"C:\Users\gt3r390\Documents\GitHub\shogi-teacher\backend"  # Set working directory
)

print("Sending usi...")
process.stdin.write("usi\n")
process.stdin.flush()

# Read until usiok
for i in range(100):
    line = process.stdout.readline().strip()
    if line:
        print(f"< {line}")
    if line == "usiok":
        break

print("\nSending isready...")
process.stdin.write("isready\n")
process.stdin.flush()

# Read until readyok
for i in range(100):
    line = process.stdout.readline().strip()
    if line:
        print(f"< {line}")
    if line == "readyok":
        print("\n✓ Engine is ready!")
        break
    if "Error" in line or "error" in line:
        print(f"\n❌ ERROR: {line}")
        break

print("\nTrying usinewgame...")
process.stdin.write("usinewgame\n")
process.stdin.flush()

print("Trying position...")
process.stdin.write("position startpos\n")
process.stdin.flush()

print("Trying go...")
process.stdin.write("go btime 1000 wtime 1000 byoyomi 0\n")
process.stdin.flush()

print("\nWaiting for bestmove...")
for i in range(1000):
    line = process.stdout.readline().strip()
    if line:
        print(f"< {line}")
    if line.startswith("bestmove"):
        print(f"\n✓✓✓ SUCCESS! Engine works perfectly!")
        break

process.stdin.write("quit\n")
process.stdin.flush()
process.wait()
