import requests
import json

BASE_URL = "http://127.0.0.1:8000"

def test_root():
    print("Testing Root...")
    try:
        r = requests.get(f"{BASE_URL}/")
        print(r.json())
    except Exception as e:
        print(f"Failed: {e}")

def test_game_state():
    print("\nTesting Game State (Initial)...")
    try:
        r = requests.get(f"{BASE_URL}/game/state")
        print(json.dumps(r.json(), indent=2))
    except Exception as e:
        print(f"Failed: {e}")

def test_make_move():
    print("\nTesting Make Move (7g7f)...")
    # Initial position
    sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
    payload = {
        "sfen": sfen,
        "move": "7g7f"
    }
    try:
        r = requests.post(f"{BASE_URL}/game/move", json=payload)
        print(json.dumps(r.json(), indent=2))
    except Exception as e:
        print(f"Failed: {e}")

def test_explain():
    print("\nTesting Explanation (Mock Analysis)...")
    sfen = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
    analysis = {
        "bestmove": "7g7f",
        "score_cp": 30,
        "mate": None
    }
    try:
        r = requests.post(f"{BASE_URL}/explain", params={"sfen": sfen}, json=analysis)
        print(r.json())
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    test_root()
    test_game_state()
    test_make_move()
    test_explain()
