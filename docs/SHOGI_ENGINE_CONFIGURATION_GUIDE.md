# Shogi Engine Configuration Guide

- Run `python inspect_engine_options.py` to see all available options for each engine

## Table of Contents
1. [Universal USI Options](#universal-usi-options)
2. [Engine-Specific Configurations](#engine-specific-configurations)
   - [Fairy-Stockfish (Large Board)](#fairy-stockfish-large-board)
   - [Fukauraaou V9.01 (GPU-Accelerated)](#fukauraaou-v901-gpu-accelerated)
   - [YaneuraOu NNUE](#yaneuraou-nnue)
   - [HoneyWaffle WCSC28](#honeywaffle-wcsc28)
   - [Apery WCSC30](#apery-wcsc30)
   - [SeoTsume](#seotsume)
3. [Recommended Settings Summary](#recommended-settings-summary)

---

## Universal USI Options

### Critical Options (Present in Most Engines)

#### **Hash / USI_Hash**
- **What it does**: Memory allocated for the transposition table (in MB). The transposition table stores previously analyzed positions to avoid recalculating them.
- **Impact**: Higher values significantly improve search quality and speed by reducing redundant calculations.
- **Typical Range**: 1 - 33,554,432 MB (but practically limit to 256-8192 MB per engine)
- **Are the ranges reasonable?**: Yes, the maximum (33,554,432 MB = 32 TB) is theoretically possible but impractical.

#### **Threads**
- **What it does**: Number of CPU threads used for search. More threads = faster parallel search.
- **Impact**: Nearly linear speedup until diminishing returns (typically 8-16 threads)
- **Typical Range**: 1 - 1024 (but should limit the range based on the systems CPU)
- **Are the ranges reasonable?**: Yes, though beyond ~32 threads shows diminishing returns

#### **MultiPV**
- **What it does**: Number of best lines (Principal Variations) to calculate simultaneously. 1 = only best move, higher values show alternatives.
- **Impact**: Critical for teaching! Shows multiple candidate moves and their evaluations.
- **Typical Range**: 1 - 600 (but practically limit to 1-5 as beyond this is rarely useful)
- **Are the ranges reasonable?**: Yes, though beyond 5-10 is rarely useful
- **System Recommendation**: 3-5 for teaching
  - 3 = good balance (best move + 2 alternatives)
  - 5 = excellent for beginners (more options to discuss)
  - 1 = use only for fastest move selection

#### **USI_Ponder / Ponder**
- **What it does**: Think during opponent's turn (or when waiting)
- **Impact**: Can improve strength by ~50-100 Elo but may cause GUI issues
- **System Recommendation**: **false** for teaching system
  - Reduces system responsiveness
  - Not needed for analysis
  - Enable only for competitive play

---

## Engine-Specific Configurations

### **Fairy-Stockfish (Large Board)**
**Est. Elo**: 3800 | **Level**: Superhuman | **Strength Control**: Yes (Skill Level & UCI_Elo)

#### Purpose in Your System
Best choice for **adjustable difficulty** teaching. Can simulate players from beginner (500 Elo) to superhuman (2850+ Elo).

#### Critical Options

**Strength Control (Choose ONE method):**

1. **UCI_Elo Method** (Recommended for teaching):
   ```
   UCI_LimitStrength = true
   UCI_Elo = 500-2850
   ```
   - **500-800**: Beginner level (makes obvious mistakes)
   - **1000-1500**: Club player level
   - **1800-2200**: Strong amateur to professional
   - **2400-2850**: Top professional level
   - Calibrated at 60s+0.6s time control

2. **Skill Level Method** (Alternative):
   ```
   Skill_Level = -20 to 20
   ```
   - **-20 to 0**: Very weak (beginner)
   - **5-10**: Intermediate
   - **15-20**: Strong to maximum strength
   - Note: UCI_Elo overrides Skill Level if both are set

#### Recommended Configuration for Teaching

```yaml
# High Priority
Hash: 4096                    # 4GB - excellent for analysis
Threads: 1-4                  # increase for faster performance if needed
MultiPV: 1-3                  # Show 1-3 best moves
Ponder: false                 # Keep system responsive

# Strength Control (Beginner Mode Example)
UCI_LimitStrength: true       # Enable strength limiting
UCI_Elo: 1200                 # Adjustable based on student level
Skill_Level: 20               # Ignored when UCI_LimitStrength is true

# Shogi-Specific
UCI_Variant: shogi            # Critical - must be set!
EvalFile: networks/shogi.nnue # Path to NNUE network
Use_NNUE: true                # Enable NNUE evaluation

# Optional - Advanced
UCI_AnalyseMode: false        # Set true for pure analysis (disables some optimizations)
Move_Overhead: 10             # Network lag compensation (ms)
Slow_Mover: 100               # Time management (100 = default)
```

#### Less Critical Options
- **Debug_Log_File**: Leave empty unless debugging
- **Clear_Hash**: Button to clear transposition table (use via GUI)
- **UCI_Chess960**: Leave false for standard shogi
- **UCI_ShowWDL**: Can show win/draw/loss probabilities (optional, but may be useful for teaching)
- **SyzygyPath**: Endgame tablebases (not applicable to shogi)

---

### **Fukauraaou V9.01 (GPU-Accelerated)**
**Est. Elo**: 4200 | **Level**: Superhuman | **GPU**: NVIDIA TensorRT Required

#### Purpose in Your System
**Absolute strongest** engine for high-level analysis. Requires a RTX 2070 or better since it uses CUDA for GPU-accelerated deep learning evaluation.

#### GPU-Specific Considerations
- Requires CUDA 12.x and TensorRT 8.6+
- First startup is SLOW (TensorRT optimization ~1-2 minutes)
- Creates cached .serialized files for subsequent fast startups
- If GPU driver updates, delete .serialized cache files

#### Critical Options

```yaml
# Memory (Should depend on how much RAM the user has available on their system)
Hash: 8192                      # 2-8GB - 8GB maximum practical for single engine
Threads: 1-4                    # GPU-accelerated needs fewer CPU threads

# GPU Configuration
Max_GPU: 1                      # Number of GPUs (most only have 1)
UCT_Threads: 2                  # Threads per GPU (2-3 recommended)
DNN_Batch_Size: 128             # Neural network batch size (128 default)

# Multi-PV
MultiPV: 3                      # 1-3 best lines for teaching

# Time Management
MinimumThinkingTime: 2000       # Minimum 2 seconds per move (ms)
NetworkDelay: 400               # GPU inference delay compensation (ms)
NetworkDelay2: 1400             # Additional network delay (ms)
SlowMover: 100                  # 100 = default time allocation

# Opening Book
USI_OwnBook: true               # Use opening book
BookFile: standard_book.db      # Opening database
BookMoves: 16                   # Use book for first 16 moves
BookDepthLimit: 16              # Maximum book depth

# Evaluation
EvalDir: eval                   # Directory containing neural network
Eval_Coef: 285                  # Evaluation coefficient (default)

# Advanced Search Parameters
UCT_NodeLimit: 10000000         # Max search nodes (10M default)
                                # 1 node ≈ 2KB RAM
                                # 10M nodes ≈ 20GB RAM usage (so be aware of this)

# Monte Carlo Tree Search
C_init: 144                     # MCTS exploration parameter (root)
C_base: 28288                   # MCTS exploration base
C_init_root: 116                # MCTS exploration (root specific)
C_base_root: 25617              # MCTS base (root specific)
```

#### Understanding the "Weird" Ranges
Many options have seemingly absurd max values (e.g., NodesLimit: 9,223,372,036,854,775,807). These are actually:
- **INT64_MAX** or **INT32_MAX** values
- Represent "unlimited" rather than actual practical limits
- Setting to 0 typically means "no limit"

#### System Recommendations
```yaml
# Optimal Configuration for Training and Analysis
Hash: 8192
Threads: 4                      # GPU does heavy lifting
UCT_Threads: 2                  # 2-3 recommended for single GPU
DNN_Batch_Size: 128             # Good for 16GB VRAM
MultiPV: 3
MinimumThinkingTime: 2000
USI_Ponder: false               # Save GPU for active analysis
NetworkDelay: 400
NetworkDelay2: 1400
```

#### When to Use FukauraOu
- **High-level analysis** (dan-level and above)
- **Post-game review** of strong players
- **Finding the absolute best move** in complex positions
- **NOT for beginners** - too strong, moves may seem incomprehensible

---

### **YaneuraOu NNUE**
**Est. Elo**: 4000 | **Level**: Superhuman | **WCSC29 Champion**

#### Purpose in Your System
**Excellent all-around engine** for teaching. Stronger than Fairy-Stockfish but without GPU requirements.

#### Critical Options

```yaml
# Memory
USI_Hash: 4096                  # 2-8GB hash table
Threads: 8                      # 1-16 recommended

# Search
MultiPV: 3                      # Multiple variations
USI_Ponder: false               # Keep responsive

# Time Management
NetworkDelay: 120               # Lower than GPU version
NetworkDelay2: 1120
MinimumThinkingTime: 2000       # 2 second minimum
SlowMover: 100                  # Default time allocation

# Opening Book
USI_OwnBook: true
BookFile: standard_book.db
BookMoves: 16                   # Use book for first 16 moves
BookDepthLimit: 16

# Evaluation
EvalDir: eval                   # Contains nn.bin (NNUE network)
FV_SCALE: 16                    # NNUE scaling factor (default)
```

#### Key Differences from FukauraOu
- **No GPU required**: Pure CPU engine
- **Slightly weaker**: ~200 Elo lower than FukauraOu
- **Faster startup**: No TensorRT optimization delay
- **More threads**: Can effectively use 8-16 threads
- **Still superhuman**: 4000 Elo is extremely strong

#### System Recommendations
```yaml
USI_Hash: 4096
Threads: 8                     
MultiPV: 3
MinimumThinkingTime: 2000
SlowMover: 100
NetworkDelay: 120
NetworkDelay2: 1120
USI_Ponder: false
EvalDir: eval
```

#### When to Use YaneuraOu
- **Advanced teaching** (1-3 dan level)
- **Fast analysis** (no GPU warmup delay)
- **When GPU is busy** (LLM inference)
- **Balanced CPU usage** (leaves headroom)

---

### **HoneyWaffle WCSC28**
**Est. Elo**: 3200 | **Level**: Strong Amateur to Professional

#### Purpose in Your System
**Mid-strength engine** for intermediate teaching. Good balance between strength and accessibility.

#### Critical Options

```yaml
# Memory
Hash: 2048                      # 2GB-4GB sufficient for this strength
Threads: 4                      # 1-8 recommended, provides good parallelization

# Search
MultiPV: 3
WriteDebugLog: false

# Time Management
NetworkDelay: 120
NetworkDelay2: 1120
MinimumThinkingTime: 2000
SlowMover: 100                  # Time allocation strategy

# Opening Book
BookFile: standard_book.db
BookMoves: 16
BookDepthLimit: 16

# Evaluation
EvalDir: eval                   # KPPT evaluation files
EvalShare: false                # Don't share eval between instances

# Advanced
Contempt: 2                     # Slightly avoid draws (positive)
ContemptFromBlack: false        # Apply contempt equally
MaxMovesToDraw: 0               # No automatic draw declaration
```

#### Understanding Contempt
- **Positive values** (e.g., +2): Avoid draws, play for win
- **Negative values**: Accept draws more readily
- **Range**: -30,000 to +30,000 (practical: -10 to +10)
- **Your setting**: 2 (slight preference to avoid draws)

#### System Recommendations
```yaml
Hash: 2048
Threads: 4
MultiPV: 3
MinimumThinkingTime: 2000
SlowMover: 100
Contempt: 2
BookMoves: 16
EvalDir: eval
```

#### When to Use HoneyWaffle
- **Mid-level teaching** (1-2 kyu to low dan)
- **Multiple simultaneous engines** (lower resource usage)
- **Intermediate analysis** (strong but not overwhelming)

---

### **Apery WCSC30**
**Est. Elo**: 3500 | **Level**: Professional

#### Purpose in Your System
**Strong professional-level** engine with KPPT evaluation. Good for upper intermediate teaching.

#### Critical Options

```yaml
# Memory
USI_Hash: 1024                  # 1GB sufficient
Eval_Hash: 256                  # Evaluation cache
Threads: 4

# Search
MultiPV: 3
USI_Ponder: false

# Time Management
Minimum_Thinking_Time: 20       # Note: in MILLISECONDS (20ms minimum)
Slow_Mover: 84                  # More conservative than default 100
Byoyomi_Margin: 500             # Japanese time control margin (ms)
Time_Margin: 500                # General time safety margin

# Opening Book
Book_Enable: false              # Set true to use opening book
Book_File:                      # Specify if Book_Enable is true

# Evaluation
Eval_Dir: eval/20190617         # Specific evaluation version
```

#### Unique Timing Options Explained
- **Byoyomi_Margin**: Safety buffer for byoyomi (Japanese blitz time control)
  - 500ms = half second safety margin
  - Prevents time losses in fast games
- **Time_Margin**: General safety buffer for all time controls
- **Minimum_Thinking_Time**: 20ms is VERY short - this is for rapid play

#### Your System Recommendations
```yaml
USI_Hash: 1024
Eval_Hash: 256
Threads: 4
MultiPV: 3
Minimum_Thinking_Time: 2000     # Override to 2000ms (2 seconds) for teaching
Slow_Mover: 84
Eval_Dir: eval/20190617
Book_Enable: true               # Enable for teaching
```

#### When to Use Apery
- **Upper intermediate teaching** (1-2 dan level)
- **Historical comparison** (WCSC30 was 2020)
- **KPPT evaluation study** (different from NNUE)

---

### **SeoTsume (脊尾詰)**
**Purpose**: Tsume-Shogi (Mate Problem) Solver | **NOT for Regular Play**

#### Purpose in Your System
**Specialized tool** for teaching checkmate patterns and solving tsume problems.

#### Critical Options

```yaml
Hash: 224                       # Modest hash for mate search
Do_YoTsume_Search: false        # Enable for "yotsume" (helpmate) problems
YoTsume_Second: 60              # Time limit for yotsume search (seconds)
```

#### Understanding SeoTsume
- **Famous Achievement**: Solved "Microcosmos" (1525-move mate) in 1997
- **Not for playing**: Evaluation is mate-focused, not positional
- **Mate search only**: Will find checkmates, not best general moves
- **Depth**: Can search extremely deep for mate sequences

#### Your System Recommendations
```yaml
Hash: 224                       # Keep default (adequate for mate search)
Do_YoTsume_Search: false        # Unless specifically teaching helpmates
YoTsume_Second: 60
```

#### When to Use SeoTsume
- **Tsume problem solving** (checkmate puzzles)
- **Mate verification** (is there a forced mate?)
- **Checkmate teaching** (showing forcing sequences)
- **NOT for general game analysis**

---


## Critical Option Ranges - Reality Check

### Options with Suspicious Max Values, just don't allow users to see or modify these options in the advanced settings window

1. **NodesLimit: 9,223,372,036,854,775,807**
   - This is `INT64_MAX` (2^63 - 1)
   - Means "unlimited" in practice
   - Setting to 0 typically disables the limit
   - **Practical values**: 10,000 to 10,000,000 nodes

2. **DepthLimit: 2,147,483,647**
   - This is `INT32_MAX` (2^31 - 1)
   - Means "unlimited depth"
   - **Practical values**: 10-40 ply (half-moves)

### Options we need to allow users to adjust but cap the max value

1. **Hash: 33,554,432 MB**
   - Theoretically 32 TB
   - **Practical range**: 256-8192 MB for most use cases
   - Limit to: 256-8192 MB per engine

2. **Threads: 1024**
   - Most systems: 4-64 threads
   - Diminishing returns after ~16-32 threads
   - Limit to: 1-16 threads per engine

---

## Opening Book Strategy

### Book Options Explained

```yaml
USI_OwnBook: true              # Use engine's built-in book
BookFile: standard_book.db     # Which book database
BookMoves: 16                  # Use book for first N moves
BookDepthLimit: 16             # Maximum ply depth in book
BookIgnoreRate: 0              # % chance to ignore book (0 = always use)
NarrowBook: false              # Limit to narrow opening repertoire
```

### For Teaching System

**Recommended**:
```yaml
BookMoves: 16                  # Exit book after move 16 (ply 32)
NarrowBook: false              # Show variety of openings
```

**Why**: 
- Students see diverse opening strategies
- Engine starts "thinking" at move 16, making analysis more relevant
- Book prevents engine from playing strange opening moves

---

## File Structure Best Practices

### Recommended Directory Layout

```
/engines/
├── fairy-stockfish/
│   ├── fairy-stockfish-largeboard_x86-64.exe
│   ├── networks/
│   │   └── shogi.nnue
│   └── books/
│       └── shogi.epd
├── fukauraou/
│   ├── YaneuraOu-Deep-TensorRT.exe
│   ├── eval/
│   │   └── model.onnx
│   └── book/
│       └── standard_book.db
├── yaneuraou/
│   ├── YaneuraOu.exe
│   ├── eval/
│   │   └── nn.bin
│   └── book/
│       └── standard_book.db
└── [other engines...]
```

---

## Troubleshooting Common Issues

### "Engine not responding" (Fairy-Stockfish)
- Check: UCI_Variant is set to "shogi"
- Check: EvalFile points to valid shogi.nnue

### "FukauraOu slow startup"
- First run: TensorRT optimization (1-2 min) - NORMAL
- GPU driver updated: Delete .serialized cache files
- Check: CUDA 12.x is installed

### "Out of memory" errors
- Reduce Hash values
- Reduce UCT_NodeLimit (FukauraOu)
- Check total system RAM usage

### "Weak engine plays too strong"
- Fairy-Stockfish: Verify UCI_LimitStrength is true
- Check: UCI_Elo is actually being applied
- Lower UCI_Elo or Skill_Level

---

## Quick Reference: Option Priority

### ⭐ Critical (Always Configure)
- Hash / USI_Hash
- Threads
- MultiPV (for teaching)

### 🔧 Important (Configure for Teaching)
- UCI_LimitStrength + UCI_Elo (Fairy-Stockfish)
- MinimumThinkingTime
- Ponder (set to false)

### 📚 Opening Books (Configure Once)
- USI_OwnBook / BookFile
- BookMoves
- BookDepthLimit

### ⚙️ Advanced (Tune if Needed)
- NetworkDelay / NetworkDelay2
- SlowMover
- Contempt (for specific play styles)

### 🔬 Expert (Usually Leave Default)
- UCT parameters (FukauraOu MCTS)
- Eval_Coef
- FV_SCALE
- All parameters with ranges to INT_MAX - hide these