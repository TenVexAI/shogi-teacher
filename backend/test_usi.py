import subprocess

# Test with proper output consumption
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

print("\n=== Sending usi ===")
process.stdin.write("usi\n")
process.stdin.flush()

# Read ALL output until usiok
lines_read = 0
while True:
    line = process.stdout.readline().strip()
    lines_read += 1
    if line:  # Only print non-empty lines
        print(f"< {line}")
    if line == "usiok":
        print(f"(Read {lines_read} lines total)")
        break
    if lines_read > 1000:  # Safety limit
        print("ERROR: Too many lines!")
        break

print("\n=== Sending isready ===")
process.stdin.write("isready\n")
process.stdin.flush()

lines_read = 0
while True:
    line = process.stdout.readline().strip()
    lines_read += 1
    if line:
        print(f"< {line}")
    if line == "readyok":
        print(f"(Read {lines_read} lines total)")
        break
    if lines_read > 1000:
        print("ERROR: Too many lines!")
        break

print("\n=== Sending usinewgame ===")
process.stdin.write("usinewgame\n")
process.stdin.flush()

print("\n=== Sending position ===")
process.stdin.write("position startpos\n")
process.stdin.flush()

print("\n=== Sending go ===")
process.stdin.write("go btime 1000 wtime 1000 byoyomi 0\n")
process.stdin.flush()

# Read until bestmove
lines_read = 0
while True:
    line = process.stdout.readline().strip()
    lines_read += 1
    if line:
        print(f"< {line}")
    if line.startswith("bestmove"):
        print(f"\n✓ SUCCESS! (Read {lines_read} lines)")
        break
    if lines_read > 10000:
        print("ERROR: Too many lines!")
        break

process.stdin.write("quit\n")
process.stdin.flush()
process.wait()
print("\n✓ Test completed")
