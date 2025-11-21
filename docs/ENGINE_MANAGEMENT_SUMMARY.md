# Engine Management System - Implementation Summary

## Overview

The Engine Management System is a configuration-driven architecture that allows:
- Hot-swapping USI-compatible shogi engines
- Per-side engine selection (different engines for Black/White)
- Adjustable strength levels for training
- Easy addition of custom engines via `config.json` files

---

## Key Documents

1. **`ENGINE_MANAGEMENT_DESIGN.md`** - Complete technical design
2. **`ENGINE_CONFIG_SCHEMA.md`** - Standard schema for engine configuration files
3. **`ADDING_CUSTOM_ENGINES.md`** - User guide for adding custom engines

---

## Architecture Summary

### Configuration-Driven Discovery

All engines are defined by `config.json` files in `backend/engines/` subdirectories.

```
backend/engines/
  ├── yaneuraou/
  │   ├── YaneuraOu.exe
  │   ├── eval/nn.bin
  │   └── config.json
  ├── fairy-stockfish/
  │   ├── fairy-stockfish-largeboard_x86-64.exe
  │   ├── networks/shogi.nnue
  │   ├── books/shogi.epd
  │   └── config.json
  └── (other engines...)
```

### Engine Discovery Process

1. Scan `backend/engines/` for subdirectories
2. Load `config.json` from each subdirectory
3. Validate against schema
4. Verify required files exist
5. Make engines available for selection

### Engine Manager

Central class that handles:
- Engine process lifecycle (spawn, initialize, configure, terminate)
- USI protocol communication
- Hot-swapping between engines
- Game state synchronization
- Per-side engine management

---

## Current Engines

### Built-in Engines

1. **YaneuraOu NNUE** (~4000 Elo)
   - Standard YaneuraOu with NNUE evaluation
   - Requires `eval/nn.bin`

2. **Fukauraaou V9.01** (~4200 Elo)
   - GPU-accelerated TensorRT version
   - Requires NVIDIA GPU with CUDA/TensorRT
   - 13 DLL dependencies

3. **Apery WCSC30** (~3500 Elo)
   - Rust-based, KPPT evaluation
   - Requires `eval/KKP.bin` and `eval/KPP.bin`

4. **Fairy-Stockfish** (~3800 Elo)
   - Multi-variant engine with NNUE
   - **Best for training** - supports Skill Level (0-20) and UCI_Elo
   - Includes opening book

5. **HoneyWaffle WCSC28** (~3200 Elo)
   - KPPT evaluation
   - Two versions: AVX2 (faster) and SSE4.2 (compatible)
   - Includes opening book

6. **SeoTsume** (N/A)
   - **Specialized tsume-shogi solver** (not for regular play)
   - Famous for solving 1525-move "Microcosmos" problem

---

## Strength Control

### Methods

1. **Skill Level** (0-20) - Fairy-Stockfish
2. **UCI_Elo** (1000-3000) - Fairy-Stockfish
3. **Time Limits** - All engines
4. **Hash Size** - All engines
5. **Thread Limits** - All engines

### Training Presets

- **Beginner** (Level 2): Makes obvious mistakes
- **Intermediate** (Level 5): Amateur club player (~1800 Elo)
- **Advanced** (Level 8): Strong amateur to weak professional
- **Master** (Level 10): Full engine strength

---

## Implementation Phases

### Phase 1: Core Engine Management
- EngineManager class
- USI protocol communication
- Process lifecycle management
- Engine initialization and configuration

### Phase 2: Multi-Engine Support
- Engine discovery system
- Per-side engine selection
- Hot-swapping mechanism
- Game state synchronization

### Phase 3: Configuration & UI
- Engine selection UI
- Engine settings modal
- Configuration persistence
- Error handling and user feedback

### Phase 4: Strength Control
- Skill level abstraction layer
- Training mode presets
- UI controls for strength adjustment

### Phase 5: Advanced Features
- Engine vs. Engine matches
- Opening book support
- Analysis mode (MultiPV)
- Engine tournaments

---

## Key Features

### For Users
- Select different engines for Black and White
- Adjust engine strength for training
- Add custom engines by dropping files and creating config.json
- View engine information (author, version, strength)
- Configure engine options (hash, threads, etc.)

### For Developers
- Configuration-driven architecture
- Automatic engine discovery and validation
- Standardized config.json schema
- USI protocol abstraction
- Hot-swapping without game interruption

---

## Technical Stack

- **Backend**: Node.js with `child_process` for engine management
- **Protocol**: USI (Universal Shogi Interface)
- **Configuration**: JSON-based engine configs
- **Process Management**: Spawn, communicate via stdin/stdout, graceful shutdown

---

## Next Steps

1. Review design documents
2. Ask clarifying questions
3. Begin Phase 1 implementation
4. Test with existing engines
5. Iterate and refine

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-20
