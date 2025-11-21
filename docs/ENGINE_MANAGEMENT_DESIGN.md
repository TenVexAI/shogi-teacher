# Engine Management System - Design Document

## Executive Summary

This document outlines the design for a flexible engine management system that allows:
- Hot-swapping USI-compatible engines during runtime
- Per-side engine selection (different engines for Black/White)
- Engine-specific configuration via USI options
- Adjustable strength levels for training purposes
- Configuration-driven engine discovery and management

**Related Documents:**
- `ENGINE_CONFIG_SCHEMA.md` - Standard schema for engine configuration files
- `ADDING_CUSTOM_ENGINES.md` - Instructions for users to add custom engines

---

## 1. USI-Compatible Engines Overview

### 1.1 Recommended Engines

#### **YaneuraOu (やねうら王)**
- **Repository**: https://github.com/yaneurao/YaneuraOu
- **Status**: World's strongest shogi engine, WCSC29 winner
- **Variants**: 
  - Standard YaneuraOu
  - Fukaura King (深浦王) - specialized variant
  - Multiple NNUE versions (halfKP256, etc.)
- **Strength**: ~4000+ Elo with strong eval files
- **Eval Files**: Requires separate `.bin` files (e.g., `nn.bin` for NNUE)
- **License**: GPL 3.0
- **USI Support**: Full USI protocol compliance
- **Notable Features**:
  - Multiple search algorithms
  - NNUE evaluation support
  - Extensive USI options for tuning

#### **Fairy-Stockfish**
- **Repository**: https://github.com/fairy-stockfish/Fairy-Stockfish
- **Status**: Multi-variant engine based on Stockfish
- **Variants**:
  - Standard Fairy-Stockfish (classical eval)
  - Fairy-Stockfish-NNUE (with neural network)
- **Strength**: ~3800 Elo in shogi with NNUE, ~2700 without
- **License**: GPL 3.0
- **USI Support**: Full USI, UCI, UCCI, UCI-cyclone, CECP/XBoard
- **Notable Features**:
  - Supports 50+ chess variants including shogi
  - Built-in skill level controls
  - NNUE networks available
  - Excellent for learning (weaker than specialized engines)

#### **Apery**
- **Repository**: https://github.com/HiraokaTakuya/apery
- **Status**: Strong open-source engine
- **Strength**: Professional level
- **License**: GPL 3.0
- **Notable Features**:
  - Clean codebase
  - Good for educational purposes
  - Multiple evaluation function support

#### **Other Notable Engines**
- **Gikou (技巧)**: Strong amateur to professional level
- **Lesserkai**: Derivative of stronger engines
- **Kristallweizen**: NNUE evaluation function (used with YaneuraOu)
- **Suisho (水匠)**: Top-tier engine with specialized eval files
- **GNUShogi**: Older, weaker, but fully open-source and simple

### 1.2 Engine Strength Comparison

| Engine | With NNUE | Without NNUE | Notes |
|--------|-----------|--------------|-------|
| YaneuraOu + Kristallweizen | ~4000+ | ~3000 | Requires eval file |
| Fairy-Stockfish | ~3800 | ~2700 | Built-in NNUE support |
| Suisho | ~4000+ | N/A | Specialized eval files |
| Apery | ~3500 | ~2800 | Varies by version |
| GNUShogi | N/A | ~1500 | Beginner-friendly |

---

## 2. USI Protocol Deep Dive

### 2.1 Core USI Commands

#### **Initialization Sequence**
```
GUI → Engine: usi
Engine → GUI: id name YaneuraOu NNUE 7.6.3
Engine → GUI: id author by yaneurao
Engine → GUI: option name Hash type spin default 256 min 1 max 33554432
Engine → GUI: option name Threads type spin default 1 min 1 max 1024
Engine → GUI: option name USI_Ponder type check default false
Engine → GUI: option name SkillLevel type spin default 20 min 0 max 20
Engine → GUI: usiok
GUI → Engine: isready
Engine → GUI: readyok
```

#### **Configuration**
```
GUI → Engine: setoption name Hash value 1024
GUI → Engine: setoption name Threads value 4
GUI → Engine: setoption name SkillLevel value 10
```

#### **Game Flow**
```
GUI → Engine: usinewgame
GUI → Engine: position startpos moves 7g7f 3c3d
GUI → Engine: go btime 600000 wtime 600000 binc 0 winc 0
Engine → GUI: info depth 12 score cp 45 nodes 125000 nps 50000 pv 2g2f 8c8d
Engine → GUI: bestmove 2g2f ponder 8c8d
```

### 2.2 USI Options (Engine Configuration)

Common USI options across engines:

| Option | Type | Description | Typical Range |
|--------|------|-------------|---------------|
| `Hash` | spin | Hash table size in MB | 1-33554432 |
| `Threads` | spin | Number of CPU threads | 1-1024 |
| `USI_Ponder` | check | Enable pondering | true/false |
| `MultiPV` | spin | Number of principal variations | 1-500 |
| `SkillLevel` | spin | Playing strength (if supported) | 0-20 |
| `UCI_LimitStrength` | check | Enable strength limiting | true/false |
| `UCI_Elo` | spin | Target Elo rating | 1000-3000 |
| `EvalDir` | string | Path to evaluation files | file path |
| `BookFile` | string | Opening book file | file path |
| `NetworkFile` | string | NNUE network file | file path |

**Note**: Not all engines support all options. The engine advertises its options during initialization.

---

## 3. Engine Configuration System

### 3.1 Configuration-Driven Architecture

All engines are defined by `config.json` files following the schema in `ENGINE_CONFIG_SCHEMA.md`.

#### **Engine Discovery**
```typescript
interface EngineConfig {
  // See ENGINE_CONFIG_SCHEMA.md for complete schema
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  executable: string;
  protocol: "USI";
  evalFiles: string[];
  requiredFiles: string[];
  optionalFiles?: string[];
  features: EngineFeatures;
  defaultOptions: Record<string, string>;
  strength: EngineStrength;
  license: string;
  // ... optional fields
}

interface EngineFeatures {
  nnue: boolean;
  ponder: boolean;
  multiPV: boolean;
  skillLevel: boolean;
  uciElo: boolean;
  openingBook: boolean;
  [key: string]: boolean;  // Custom features
}

interface EngineStrength {
  estimated_elo: number | "N/A";
  level: string;
  notes: string;
}
```

#### **Engine Discovery Process**
```typescript
async function discoverEngines(): Promise<EngineConfig[]> {
  const enginesDir = path.join(__dirname, 'engines');
  const engines: EngineConfig[] = [];
  
  // Scan all subdirectories
  const folders = await fs.readdir(enginesDir, { withFileTypes: true });
  
  for (const folder of folders) {
    if (!folder.isDirectory()) continue;
    
    const configPath = path.join(enginesDir, folder.name, 'config.json');
    
    try {
      // Load and parse config.json
      const configData = await fs.readFile(configPath, 'utf-8');
      const config: EngineConfig = JSON.parse(configData);
      
      // Validate schema
      validateEngineConfig(config);
      
      // Verify required files exist
      const engineDir = path.join(enginesDir, folder.name);
      await verifyRequiredFiles(engineDir, config.requiredFiles);
      
      // Add full paths
      config.executablePath = path.join(engineDir, config.executable);
      config.engineDir = engineDir;
      
      engines.push(config);
    } catch (error) {
      console.error(`Failed to load engine from ${folder.name}:`, error);
    }
  }
  
  return engines;
}

function validateEngineConfig(config: EngineConfig): void {
  // Validate required fields
  const required = ['id', 'name', 'author', 'version', 'description', 
                    'executable', 'protocol', 'evalFiles', 'requiredFiles',
                    'features', 'defaultOptions', 'strength', 'license'];
  
  for (const field of required) {
    if (!(field in config)) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Validate protocol
  if (config.protocol !== 'USI') {
    throw new Error(`Invalid protocol: ${config.protocol}. Must be "USI"`);
  }
  
  // Validate features
  const requiredFeatures = ['nnue', 'ponder', 'multiPV', 'skillLevel', 'uciElo', 'openingBook'];
  for (const feature of requiredFeatures) {
    if (typeof config.features[feature] !== 'boolean') {
      throw new Error(`Missing or invalid feature: ${feature}`);
    }
  }
}

async function verifyRequiredFiles(engineDir: string, files: string[]): Promise<void> {
  for (const file of files) {
    const filePath = path.join(engineDir, file);
    try {
      await fs.access(filePath);
    } catch {
      throw new Error(`Required file not found: ${file}`);
    }
  }
}
```

---

## 4. Hot-Swapping Engine Architecture

### 4.1 Engine Process Management

#### **Engine Process State**
```typescript
interface EngineProcess {
  config: EngineConfig;           // Configuration from config.json
  process: ChildProcess | null;   // Node.js child process
  state: EngineState;              // Current state
  usiOptions: USIOption[];         // Options reported by engine
  currentOptions: Map<string, string>;  // Currently set options
}

type EngineState = 'idle' | 'initializing' | 'ready' | 'thinking' | 'error';

interface USIOption {
  name: string;
  type: 'spin' | 'check' | 'combo' | 'button' | 'string';
  default: string;
  min?: number;
  max?: number;
  var?: string[];  // For combo type
}
```

#### **Engine Lifecycle**
1. **Spawn**: Start engine process with `child_process.spawn()`
2. **Initialize**: Send `usi` command, parse options
3. **Configure**: Apply user settings via `setoption`
4. **Ready**: Send `isready`, wait for `readyok`
5. **Active**: Process game positions and moves
6. **Swap**: Gracefully stop current engine, activate new one
7. **Terminate**: Send `quit`, clean up process

### 4.2 Engine Manager Class

```typescript
class EngineManager {
  private availableEngines: Map<string, EngineConfig>;  // All discovered engines
  private runningEngines: Map<string, EngineProcess>;   // Currently running engines
  private activeEngines: {
    black: string | null;
    white: string | null;
  };
  
  async initialize(): Promise<void> {
    // Discover all engines from config files
    const engines = await discoverEngines();
    this.availableEngines = new Map(engines.map(e => [e.id, e]));
  }
  
  async startEngine(engineId: string): Promise<EngineProcess> {
    const config = this.availableEngines.get(engineId);
    if (!config) throw new Error(`Engine not found: ${engineId}`);
    
    // Spawn process
    const process = spawn(config.executablePath, [], {
      cwd: config.engineDir,
    });
    
    const engine: EngineProcess = {
      config,
      process,
      state: 'initializing',
      usiOptions: [],
      currentOptions: new Map(),
    };
    
    // Initialize USI protocol
    await this.initializeUSI(engine);
    
    // Apply default options from config.json
    await this.applyDefaultOptions(engine);
    
    // Mark as ready
    engine.state = 'ready';
    this.runningEngines.set(engineId, engine);
    
    return engine;
  }
  
  private async initializeUSI(engine: EngineProcess): Promise<void> {
    // Send 'usi' command
    engine.process.stdin.write('usi\n');
    
    // Parse response to get USI options
    // (Implementation details omitted for brevity)
    
    // Wait for 'usiok'
    // Send 'isready'
    // Wait for 'readyok'
  }
  
  private async applyDefaultOptions(engine: EngineProcess): Promise<void> {
    for (const [name, value] of Object.entries(engine.config.defaultOptions)) {
      await this.setOption(engine, name, value);
    }
  }
  
  async setOption(engine: EngineProcess, name: string, value: string): Promise<void> {
    engine.process.stdin.write(`setoption name ${name} value ${value}\n`);
    engine.currentOptions.set(name, value);
  }
  
  async swapEngine(side: 'black' | 'white', newEngineId: string): Promise<void> {
    const currentEngineId = this.activeEngines[side];
    
    // Start new engine if not already running
    if (!this.runningEngines.has(newEngineId)) {
      await this.startEngine(newEngineId);
    }
    
    // Stop current engine if different
    if (currentEngineId && currentEngineId !== newEngineId) {
      await this.stopEngine(currentEngineId);
    }
    
    // Activate new engine
    this.activeEngines[side] = newEngineId;
    
    // Sync game state
    const newEngine = this.runningEngines.get(newEngineId)!;
    await this.syncGameState(newEngine);
  }
  
  private async syncGameState(engine: EngineProcess): Promise<void> {
    // Send current position
    const moves = this.gameState.moveHistory.join(' ');
    engine.process.stdin.write(`position startpos moves ${moves}\n`);
    engine.process.stdin.write('isready\n');
    // Wait for 'readyok'
  }
  
  async stopEngine(engineId: string): Promise<void> {
    const engine = this.runningEngines.get(engineId);
    if (!engine) return;
    
    engine.process.stdin.write('quit\n');
    engine.process.kill();
    this.runningEngines.delete(engineId);
  }
}
```

### 4.3 Per-Side Engine Selection

```typescript
interface GameEngineConfig {
  blackEngine: {
    engineId: string;
    customOptions?: Record<string, string>;  // Override default options
  };
  whiteEngine: {
    engineId: string;
    customOptions?: Record<string, string>;
  };
}

async function requestMove(side: 'b' | 'w', timeControl: TimeControl): Promise<string> {
  const engineId = side === 'b' 
    ? gameConfig.blackEngine.engineId 
    : gameConfig.whiteEngine.engineId;
  
  const engine = engineManager.getRunningEngine(engineId);
  
  // Send position
  const moves = gameState.moveHistory.join(' ');
  engine.process.stdin.write(`position startpos moves ${moves}\n`);
  
  // Send go command with time control
  const goCmd = `go btime ${timeControl.blackTime} wtime ${timeControl.whiteTime} binc ${timeControl.blackInc} winc ${timeControl.whiteInc}\n`;
  engine.process.stdin.write(goCmd);
  
  // Wait for bestmove response
  const bestmove = await waitForBestmove(engine);
  return bestmove;
}
```

---

## 5. Adding Custom Engines

Users can add their own engines by following the instructions in `ADDING_CUSTOM_ENGINES.md`.

**Summary:**
1. Create a new folder in `backend/engines/`
2. Place engine executable and required files
3. Create a `config.json` following the schema in `ENGINE_CONFIG_SCHEMA.md`
4. Restart the application to discover the new engine

The system will automatically discover and validate any engine with a valid `config.json`.

---

## 6. Strength Control for Training

### 6.1 Strength Control Methods

#### **Method 1: Skill Level (Stockfish-style)**
Supported by: Fairy-Stockfish, some YaneuraOu variants

```typescript
// Set skill level 0-20 (0 = weakest, 20 = strongest)
await engine.send('setoption name Skill Level value 10');
```

**How it works**:
- Enables MultiPV internally
- Randomly selects suboptimal moves based on skill level
- Lower skill = higher probability of mistakes

**Pros**: Simple, predictable strength reduction
**Cons**: Not all engines support it

#### **Method 2: UCI_LimitStrength + UCI_Elo**
Supported by: Fairy-Stockfish, some UCI-compatible engines

```typescript
await engine.send('setoption name UCI_LimitStrength value true');
await engine.send('setoption name UCI_Elo value 1800');
```

**How it works**:
- Internally converts Elo to skill level
- Targets specific playing strength
- More intuitive for users

**Pros**: Elo-based, easier to understand
**Cons**: Limited engine support

#### **Method 3: Time/Node Limits**
Supported by: All USI engines

```typescript
// Limit thinking time
await engine.send('go btime 600000 wtime 600000 movetime 100');

// Limit nodes searched
await engine.send('go nodes 10000');

// Limit depth
await engine.send('go depth 5');
```

**How it works**:
- Restricts search depth/time/nodes
- Weaker play due to less analysis

**Pros**: Universal support
**Cons**: Inconsistent strength, depends on position complexity

#### **Method 4: Hash Size Reduction**
```typescript
await engine.send('setoption name Hash value 16'); // Small hash = weaker
```

**How it works**:
- Smaller hash table = more recalculation
- Slower, weaker play

**Pros**: Works on all engines
**Cons**: Indirect, unpredictable strength impact

#### **Method 5: Thread Limitation**
```typescript
await engine.send('setoption name Threads value 1'); // Single thread = weaker
```

**How it works**:
- Fewer threads = less parallel search
- Weaker play

**Pros**: Universal
**Cons**: Strength reduction varies

### 6.2 Recommended Strength Control Strategy

```typescript
interface StrengthConfig {
  level: number; // 1-10 (user-friendly scale)
  method: 'skill' | 'elo' | 'time' | 'hybrid';
}

function applyStrength(engine: EngineProcess, config: StrengthConfig): void {
  const { level, method } = config;
  
  if (method === 'skill' && engine.supportedFeatures.skillLevel) {
    // Map 1-10 to 0-20 skill level
    const skillLevel = Math.floor((level - 1) * 20 / 9);
    engine.send(`setoption name Skill Level value ${skillLevel}`);
  } else if (method === 'elo' && engine.supportedFeatures.elo) {
    // Map 1-10 to 1000-3000 Elo
    const elo = 1000 + (level - 1) * 222;
    engine.send('setoption name UCI_LimitStrength value true');
    engine.send(`setoption name UCI_Elo value ${elo}`);
  } else if (method === 'time') {
    // Map 1-10 to 50ms-5000ms per move
    const timeMs = 50 + (level - 1) * 550;
    // Apply during go command: `go movetime ${timeMs}`
  } else {
    // Hybrid: combine multiple methods
    applyHybridStrength(engine, level);
  }
}

function applyHybridStrength(engine: EngineProcess, level: number): void {
  // Combine time limits, hash size, and threads
  const timeMs = 100 + (level - 1) * 500;
  const hashMB = 16 + (level - 1) * 112; // 16MB to 1024MB
  const threads = Math.min(Math.ceil(level / 3), 4); // 1-4 threads
  
  engine.send(`setoption name Hash value ${hashMB}`);
  engine.send(`setoption name Threads value ${threads}`);
  // Time applied during go command
}
```

### 6.3 Training Mode Presets

```typescript
const TRAINING_PRESETS = {
  beginner: {
    level: 2,
    method: 'time',
    timeMs: 100,
    description: 'Makes obvious mistakes, good for learning basics',
  },
  intermediate: {
    level: 5,
    method: 'elo',
    elo: 1800,
    description: 'Amateur club player strength',
  },
  advanced: {
    level: 8,
    method: 'skill',
    skillLevel: 16,
    description: 'Strong amateur to weak professional',
  },
  master: {
    level: 10,
    method: 'skill',
    skillLevel: 20,
    description: 'Full engine strength',
  },
};
```

---

## 7. Implementation Roadmap

### Phase 1: Core Engine Management
- [ ] Implement `EngineManager` class
- [ ] USI protocol parser and command sender
- [ ] Process lifecycle management
- [ ] Engine initialization and configuration
- [ ] Basic error handling and recovery

### Phase 2: Multi-Engine Support
- [ ] Engine discovery system
- [ ] Per-side engine selection
- [ ] Hot-swapping mechanism
- [ ] Game state synchronization
- [ ] Configuration persistence

### Phase 3: Configuration & UI
- [ ] Engine selection UI
- [ ] Engine settings modal
- [ ] Configuration persistence
- [ ] Engine status indicators
- [ ] Error handling and user feedback

### Phase 4: Strength Control
- [ ] Skill level abstraction layer
- [ ] Training mode presets
- [ ] Elo estimation for time-limited play
- [ ] UI controls for strength adjustment
- [ ] Per-engine strength profiles

### Phase 5: Advanced Features
- [ ] Engine vs. Engine matches
- [ ] Opening book support
- [ ] Tablebase integration
- [ ] Analysis mode (MultiPV)
- [ ] Engine tournaments

---

## 8. UI/UX Recommendations

### 8.1 Engine Selection Interface

```
┌─────────────────────────────────────┐
│ Engine Configuration                │
├─────────────────────────────────────┤
│                                     │
│ Black (You):                        │
│ ┌─────────────────────────────────┐ │
│ │ YaneuraOu NNUE 7.6.3        ▼  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ White (Opponent):                   │
│ ┌─────────────────────────────────┐ │
│ │ Fairy-Stockfish NNUE        ▼  │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Strength: ●●●●●○○○○○ (5/10)        │
│                                     │
│ [Advanced Settings]  [Upload Engine]│
└─────────────────────────────────────┘
```

### 8.2 Advanced Engine Settings Modal

```
┌─────────────────────────────────────┐
│ YaneuraOu NNUE 7.6.3 - Settings     │
├─────────────────────────────────────┤
│                                     │
│ Hash Size:     [1024] MB            │
│ Threads:       [4]                  │
│ Ponder:        [✓] Enabled          │
│ MultiPV:       [1]                  │
│                                     │
│ Eval File:                          │
│ ┌─────────────────────────────────┐ │
│ │ eval/nn.bin                     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ [Reset to Defaults]  [Save]  [Cancel]│
└─────────────────────────────────────┘
```

---

## 8. Testing Strategy

### 8.1 Engine Compatibility Tests
- Test each supported engine (YaneuraOu, Fairy-Stockfish, etc.)
- Verify USI command parsing
- Test option configuration
- Validate move generation

### 8.2 Hot-Swap Tests
- Swap engines mid-game
- Verify game state synchronization
- Test with different engine combinations
- Stress test rapid swapping

### 8.3 Strength Control Tests
- Play games at different strength levels
- Measure actual playing strength (Elo estimation)
- Verify consistency across engines
- Test training mode presets

### 8.4 User Engine Tests
- Upload various engine formats
- Test auto-detection
- Verify sandboxing
- Test malformed/malicious engines

---

## 9. References

- **USI Protocol Specification**: http://hgm.nubati.net/usi.html
- **YaneuraOu**: https://github.com/yaneurao/YaneuraOu
- **Fairy-Stockfish**: https://github.com/fairy-stockfish/Fairy-Stockfish
- **Stockfish UCI Documentation**: https://official-stockfish.github.io/docs/stockfish-wiki/UCI-&-Commands.html
- **Computer Shogi Wiki**: https://www.qhapaq.org/shogi/shogiwiki/
- **List of Shogi Software**: https://en.wikipedia.org/wiki/List_of_shogi_software

---

## Appendix A: Sample Engine Configurations

### YaneuraOu NNUE
```json
{
  "id": "yaneuraou-nnue",
  "name": "YaneuraOu NNUE 7.6.3",
  "executable": "YaneuraOu.exe",
  "evalFile": "eval/nn.bin",
  "defaultOptions": {
    "Hash": "1024",
    "Threads": "4",
    "USI_Ponder": "false",
    "NetworkDelay": "120",
    "NetworkDelay2": "1120",
    "MinimumThinkingTime": "2000"
  }
}
```

### Fairy-Stockfish
```json
{
  "id": "fairy-stockfish",
  "name": "Fairy-Stockfish 14.0.1 NNUE",
  "executable": "fairy-stockfish.exe",
  "defaultOptions": {
    "Hash": "256",
    "Threads": "2",
    "UCI_Variant": "shogi",
    "UCI_LimitStrength": "false",
    "Skill Level": "20",
    "EvalFile": "networks/shogi-nnue.nnue"
  }
}
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-20  
**Author**: Cascade AI
