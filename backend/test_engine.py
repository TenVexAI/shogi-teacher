import subprocess
import sys

# Test if YaneuraOu works with basic subprocess
engine_path = r"C:\Users\gt3r390\Documents\GitHub\shogi-teacher\backend\engine\YaneuraOu.exe"

print(f"Testing engine: {engine_path}")
print("=" * 50)

try:
    process = subprocess.Popen(
        engine_path,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        universal_newlines=True,
        bufsize=1
    )
    
    print("Process started. Sending 'usi'...")
    process.stdin.write("usi\n")
    process.stdin.flush()
    
    print("Reading responses...")
    for i in range(20):  # Read first 20 lines
        line = process.stdout.readline()
        if not line:
            break
        print(f"< {line.strip()}")
        if line.strip() == "usiok":
            print("\n✓ Got usiok! Engine is responding.")
            break
    
    print("\nSending 'isready'...")
    process.stdin.write("isready\n")
    process.stdin.flush()
    
    for i in range(10):
        line = process.stdout.readline()
        if not line:
            break
        print(f"< {line.strip()}")
        if line.strip() == "readyok":
            print("\n✓ Got readyok! Engine is ready.")
            break
    
    print("\nSending position and go command...")
    process.stdin.write("position startpos\n")
    process.stdin.flush()
    process.stdin.write("go btime 1000 wtime 1000 byoyomi 0\n")
    process.stdin.flush()
    
    print("Waiting for bestmove...")
    for i in range(100):
        line = process.stdout.readline()
        if not line:
            break
        print(f"< {line.strip()}")
        if line.startswith("bestmove"):
            print(f"\n✓ Got bestmove: {line.strip()}")
            break
    
    process.stdin.write("quit\n")
    process.stdin.flush()
    process.wait(timeout=2)
    print("\n✓ Engine test completed successfully!")
    
except Exception as e:
    print(f"\n✗ Error: {type(e).__name__}: {e}")
    import traceback
    traceback.print_exc()
