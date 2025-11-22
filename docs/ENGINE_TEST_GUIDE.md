# Engine Testing Guide

This guide explains how to use the enhanced `test_engine_responses.py` script to understand engine capabilities for building post-game analysis and live game assistance features.

## Quick Start

```bash
cd backend

# IMPORTANT: Install python-shogi first!
pip install python-shogi

# See what each engine supports (fastest overview)
python test_engine_responses.py --capabilities

# Run all 6 priority tests (recommended for feature development)
python test_engine_responses.py --priority-only

# Run a specific test
python test_engine_responses.py --move-classification

# View all options
python test_engine_responses.py --help

# Test everything
python test_engine_responses.py --all --output engine_tests.txt
```

## ⚠️ Dependencies

**Required:** `python-shogi>=1.0.14`

```bash
pip install python-shogi
# or
pip install -r backend/requirements_test.txt
```

**Why needed:** For dynamic position generation and verification (fixes centipawn loss bugs).

## What's New in v2.1

**Philosophy Change:** Instead of assuming what engines support, we now **query each engine dynamically** for its actual capabilities.

**🚨 Critical Bug Fixes (v2.1):**
- ✅ **SFEN Generation Fixed** - Positions now generated dynamically, not hardcoded
- ✅ **Centipawn Loss Accurate** - Best moves now show 0cp loss (was showing 35cp!)
- ✅ **Mate Display Corrected** - Converts plies to moves (mate:2 = "Mate in 1 move")
- ✅ **Position Verification** - Validates every SFEN before analysis

**New Features:**
- ✅ **Dynamic capability detection** - Asks engines what they support
- ✅ **Capability summary table** - Quick overview of all engines
- ✅ **Enhanced debugging** - Detailed centipawn loss calculation steps
- ✅ **Ponder move testing** - Tests opponent prediction (Priority 6)
- ✅ **MultiPV parser** - Ready for when EngineManager supports it

**See:** `CRITICAL_FIXES_APPLIED.md` for detailed explanations

## Priority Tests

The tests are ordered by priority for building teaching features:

### Priority 1: Move Classification (Centipawn Loss)
**Most Important** - Core algorithm for post-game analysis

```bash
python test_engine_responses.py --move-classification
```

**What it tests:**
- How to analyze positions before and after each move
- Calculate centipawn loss (evaluation difference)
- Classify moves as: Brilliant ✨ / Excellent ✅ / Good 💚 / Inaccuracy 💡 / Mistake ⚠️ / Blunder ❌

**Use cases:**
- Post-game analysis showing move quality
- Identifying critical moments in a game
- Training students on evaluation concepts

### Priority 2: Multi-PV (Multiple Move Alternatives)
```bash
python test_engine_responses.py --multipv
```

**What it tests:**
- Can engines return top 3-5 moves?
- Format of multiple variations
- How scores compare across alternatives

**Use cases:**
- "Here are 3 other good moves you could play"
- Showing students multiple valid approaches
- Explaining positional vs tactical choices

**Note:** Multi-PV requires engine manager enhancements (currently shows expected format)

### Priority 3: Mate Detection
```bash
python test_engine_responses.py --mate
```

**What it tests:**
- How engines report forced mate
- Mate distance (mate in N)
- Display format for users

**Use cases:**
- Tactical training (find the mate!)
- Highlighting winning/losing positions
- Endgame teaching

### Priority 4: PV Line Display
```bash
python test_engine_responses.py --pv-display
```

**What it tests:**
- Parsing principal variation (best line)
- Display formats (compact, numbered, natural language)
- Truncating long variations

**Use cases:**
- "If you play this, the expected continuation is..."
- Explaining engine recommendations
- Showing variations in lessons

### Priority 5: Time Sensitivity
```bash
python test_engine_responses.py --time-sensitivity
```

**What it tests:**
- How analysis changes with time (100ms vs 1000ms vs 5000ms)
- Best move stability
- Evaluation accuracy vs speed

**Use cases:**
- Optimizing real-time hints (faster)
- Deep post-game analysis (slower, more accurate)
- Detecting complex positions (where more time helps)

### Priority 6: Ponder Moves (NEW!)
```bash
python test_engine_responses.py --ponder
```

**What it tests:**
- Engine's prediction of opponent's response
- Ponder move availability across positions
- Which engines provide ponder consistently

**Use cases:**
- "If you play 7g7f, opponent likely plays 3c3d"
- Showing expected continuation
- Teaching anticipation skills

## Special Tests

### Capability Summary (Fastest!)
```bash
python test_engine_responses.py --capabilities
```

**Shows a table of what each engine supports:**
- MultiPV (multiple move alternatives)
- Ponder (opponent prediction)
- Skill control (strength adjustment)
- Hash and thread configuration

**Perfect for:**
- Quick engine overview
- Deciding which engine to use for specific features
- Debugging configuration issues

**Example output:**
```
Engine                    MultiPV    Max    Ponder     Skill      Hash     Threads
────────────────────────────────────────────────────────────────────────────────
YaneuraOu NNUE           ✅ Yes     500    ✅ Yes     ❌ No      ✅ Yes   ✅ Yes
Fairy-Stockfish          ✅ Yes     500    ✅ Yes     ✅ Yes     ✅ Yes   ✅ Yes
Apery                    ❌ No      N/A    ✅ Yes     ❌ No      ✅ Yes   ✅ Yes
```

## Other Tests

### Basic Engine Response Test
```bash
python test_engine_responses.py --basic
# or just
python test_engine_responses.py
```

Tests all engines against 4 positions (starting, early/mid, mid/late, mate-in-7) and shows response format.

### Game Analysis Test (Legacy)
```bash
python test_engine_responses.py --game-analysis
```

Analyzes a 10-move opening sequence (older test, superseded by Priority 1).

## Running Multiple Tests

```bash
# All priority tests
python test_engine_responses.py --priority-only

# All tests (including basic and legacy)
python test_engine_responses.py --all

# Specific combination
python test_engine_responses.py --move-classification --mate --pv-display
```

## Output Options

By default, results are saved to a timestamped file and shown in console:

```bash
# Auto-generated: engine_test_results_20251122_021500.txt
python test_engine_responses.py --priority-only

# Custom filename
python test_engine_responses.py --priority-only --output my_tests.txt
```

## Understanding Results

### Centipawn Loss Calculation

```
Move 1: P-7f
  Move played: 7g7f
  Engine recommended: 7g7f (+42cp)
  DEBUG: eval_before = 42cp (our perspective)
  DEBUG: eval_after = -40cp (opponent's perspective)
  DEBUG: -eval_after = 40cp (flipped to our perspective)
  DEBUG: cp_loss = 42 - 40 = 2cp
  ✅ Played engine's top choice!
  Centipawn loss: 2cp
  ✅ Classification: Excellent
```

**Formula:** `cp_loss = eval_before - (-eval_after)`

- Eval flips sign because turns alternate
- Lower loss = better move
- 0-5cp loss = engine's choice (small variance is search depth differences)
- **IMPORTANT:** If you play engine's exact move, loss should be ≤10cp, not 35cp!

### Move Classification Thresholds

| CP Loss | Emoji | Classification | Meaning |
|---------|-------|----------------|---------|
| ≤ 0 | 🌟 | Brilliant | Better than engine! |
| ≤ 10 | ✅ | Excellent | Engine's choice or equivalent |
| ≤ 30 | 💚 | Good | Minor inaccuracy |
| ≤ 100 | 💡 | Inaccuracy | Small mistake |
| ≤ 300 | ⚠️ | Mistake | Significant error |
| > 300 | ❌ | Blunder | Major error |

### Mate Detection

**⚠️ CRITICAL:** USI engines report mate in **plies** (half-moves), not full moves!

```
Engine says mate:2   → Display: "Mate in 1 move"
Engine says mate:7   → Display: "Mate in 4 moves"
Engine says mate:-5  → Display: "Opponent has mate in 3 moves"
mate: None           → No forced mate (use score_cp)
```

**Conversion formula:** `full_moves = (abs(mate) + 1) // 2`

**Always use `format_mate_distance()` to display mate!** Never show the raw ply count to users.

### Time Sensitivity Results

```
  100ms:  7g7f (+42cp, depth 12, PV length 8)
  1000ms: 7g7f (+45cp, depth 18, PV length 12)
  5000ms: 2g2f (+48cp, depth 24, PV length 15)
  
⚠️  Best move CHANGED with deeper analysis!
```

This indicates a tactically complex position - use longer analysis time.

## Implementation Notes

### For MultiPV Support

To fully implement multi-PV, the engine manager needs:

1. Set `MultiPV` option before `go` command
2. Parse multiple `info` lines with `multipv` field
3. Return list of PVs instead of single bestmove

Example USI output with MultiPV=3:
```
info depth 18 multipv 1 score cp 45 pv 7g7f 3c3d 2g2f...
info depth 18 multipv 2 score cp 38 pv 2g2f 8c8d 7g7f...
info depth 18 multipv 3 score cp 35 pv 6g6f 3c3d 7g7f...
bestmove 7g7f
```

### Engine Compatibility

- **Standard engines** (YaneuraOu, Fairy-Stockfish, Apery, HoneyWaffle, FukauraOu): Support all tests
- **Tsume solvers** (SeoTsume): Only tested on mate positions
- **Opening books**: May affect early-game analysis

## Recommended Testing Workflow

### First Time Setup (5 minutes)
```bash
# 1. Quick capability check - see what you have
python test_engine_responses.py --capabilities

# 2. Run all priority tests - comprehensive understanding
python test_engine_responses.py --priority-only --output priority_results.txt
```

### Feature Development (Iterative)

**For Post-Game Analysis:**
```bash
# Focus on Priority 1 - this is your core algorithm
python test_engine_responses.py --move-classification
```
Study the DEBUG output showing:
- Position before/after each move
- Evaluation from each perspective
- Centipawn loss calculation step-by-step

**For Showing Alternatives:**
```bash
# Check which engines support MultiPV
python test_engine_responses.py --capabilities
python test_engine_responses.py --multipv
```
Note: MultiPV requires EngineManager enhancement (documented in output)

**For Mate Puzzles:**
```bash
python test_engine_responses.py --mate
```

**For Move Explanations:**
```bash
python test_engine_responses.py --pv-display
python test_engine_responses.py --ponder
```

**For Performance Tuning:**
```bash
python test_engine_responses.py --time-sensitivity
```

## Troubleshooting

**SeoTsume hangs or takes forever**
- SeoTsume is a specialized tsume (mate) solver
- It can take minutes on complex mate positions
- **Solution:** Basic test now skips tsume solvers entirely
- Use `--mate` test specifically if you want to test SeoTsume

**Different engines give different evaluations**
- This is normal - different algorithms
- Use the same engine for consistency within a session

**Best move changes with deeper analysis**
- Position is complex
- Use longer analysis time for accuracy
- Good for educational moments ("this looked good but...")

**Script stops at "Testing Engine: [name]"**
- Engine may have crashed or hung
- Check if engine executable exists and is compatible
- Try running with a different engine first

## Next Steps

After running tests, use the insights to:

1. Implement post-game analysis with move classification
2. Add real-time hints with appropriate time allocation
3. Build mate puzzles using mate detection
4. Create variation explorer with PV display
5. (Future) Show alternative moves with multi-PV

## Helper Functions for Your App

The test script includes production-ready helper functions you can use in Shogi Teacher:

### `format_mate_distance(mate_plies)`
Converts USI mate distance (plies) to user-friendly display text.

```python
from test_engine_responses import format_mate_distance

analysis = engine.analyze(position)
if analysis['mate']:
    display_text = format_mate_distance(analysis['mate'])
    # Engine: mate=2  → Display: "Mate in 1 move"
    # Engine: mate=7  → Display: "Mate in 4 moves"
    # Engine: mate=-5 → Display: "Opponent has mate in 3 moves"
```

### `verify_position_after_move(sfen_before, move, sfen_after)`
Validates SFEN generation before analysis (catches bugs).

```python
from test_engine_responses import verify_position_after_move

if not verify_position_after_move(current_sfen, player_move, resulting_sfen):
    # Handle error - invalid game state
    show_error("Invalid move or position error")
```

### `classify_move_quality(cp_loss)`
Classifies moves based on centipawn loss.

```python
from test_engine_responses import classify_move_quality

cp_loss = eval_before - (-eval_after)  # Remember to flip opponent's eval!
emoji, quality = classify_move_quality(cp_loss)

# Returns: ("✅", "Excellent"), ("💡", "Inaccuracy"), ("❌", "Blunder"), etc.
```

### `inspect_engine_capabilities(manager, engine_id)`
Query engine for its actual capabilities.

```python
from test_engine_responses import inspect_engine_capabilities

caps = inspect_engine_capabilities(manager, engine_id)
if caps['multipv']:
    # Engine supports showing alternatives!
    max_alternatives = caps['max_multipv']
```

## Implementation Status

### ✅ Fully Implemented (Ready to Use)
- **Dynamic capability detection** - `inspect_engine_capabilities()`
- **Capability summary table** - Shows what each engine supports
- **Enhanced centipawn loss** - With detailed DEBUG output
- **Move classification** - Complete algorithm with examples
- **Mate detection** - Handles mate vs score_cp properly
- **PV line display** - Multiple formatting options
- **Time sensitivity testing** - Analyzes stability across time allocations
- **Ponder move testing** - Shows opponent predictions
- **MultiPV parser** - `extract_multipv_lines()` ready to use

### ⚠️ Requires EngineManager Enhancement
**MultiPV Support** - Test shows expected behavior, but needs:
```python
# In EngineManager.analyze_position():
def analyze_position(self, ..., engine_options=None):
    if engine_options:
        for opt_name, opt_value in engine_options.items():
            process.send_command(f"setoption name {opt_name} value {opt_value}")
    # ... rest of analysis
    # Also need to collect all 'info' lines, not just final one
```

**When this is implemented:**
- Uncomment the TODO code in `test_multipv_support()`
- The `extract_multipv_lines()` parser is already ready
- Will enable "show 3 alternative moves" feature

### 🎯 Next Steps for Shogi Teacher

1. **Immediate Use:**
   - Run `--capabilities` to see which engines support what
   - Use Priority 1 algorithm for post-game analysis
   - Use mate detection for tactical puzzles
   - Use ponder moves to show continuations

2. **After EngineManager Enhancement:**
   - Enable MultiPV to show alternatives
   - Let students see "3 other good moves"
   - Teaching moment: "This move is -7cp worse than the best"

3. **Feature Ideas:**
   - Post-game report with move classifications
   - "Critical moments" detection (high cp loss)
   - Puzzle generator (mate positions)
   - Move comparison tool (student vs engine)

---

**Pro Tip:** Run `python test_engine_responses.py --capabilities` first to get a quick overview, then `python test_engine_responses.py --priority-only --output priority_tests.txt` to understand all core algorithms at once!
