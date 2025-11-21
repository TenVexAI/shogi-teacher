# Engine Configuration Schema

## Standard `config.json` Format

This document defines the standard JSON schema for engine configuration files in the `backend/engines/` directory.

---

## Schema Definition

### Required Fields

```typescript
interface EngineConfig {
  // === Core Identity ===
  id: string;                    // Unique identifier (lowercase, no spaces)
  name: string;                  // Display name
  author: string;                // Engine author(s)
  version: string;               // Version number or identifier
  description: string;           // Brief description of the engine
  
  // === Execution ===
  executable: string;            // Primary executable filename
  protocol: "USI";               // Protocol (always USI for shogi)
  
  // === Files ===
  evalFiles: string[];           // Evaluation files (relative paths)
  requiredFiles: string[];       // All required files for engine to run
  optionalFiles?: string[];      // Optional files (e.g., opening books)
  
  // === Features ===
  features: {
    nnue: boolean;               // Uses NNUE evaluation
    ponder: boolean;             // Supports pondering
    multiPV: boolean;            // Supports multiple principal variations
    skillLevel: boolean;         // Supports Skill Level option
    uciElo: boolean;             // Supports UCI_LimitStrength/UCI_Elo
    openingBook: boolean;        // Has opening book support
  };
  
  // === Default USI Options ===
  defaultOptions: {
    [optionName: string]: string;  // Key-value pairs for USI options
  };
  
  // === Strength Information ===
  strength: {
    estimated_elo: number | "N/A";  // Estimated Elo rating
    level: string;                   // Human-readable level
    notes: string;                   // Additional strength notes
    minLevel: number;                // Minimum strength level (1-10)
    maxLevel: number;                // Maximum strength level (1-10)
  };
  
  // === Strength Control ===
  strengthControl: {
    supported: boolean;              // Whether engine supports strength adjustment
    methods: string[];               // Methods: "skillLevel", "uciElo", "time", "hash", "threads"
    notes: string;                   // Notes about strength control
  };
  
  // === License ===
  license: string;               // License type (e.g., "GPL-3.0", "Proprietary")
}
```

### Optional Fields

```typescript
interface EngineConfigOptional {
  // === Alternative Executables ===
  executableAlternatives?: Array<{
    file: string;                // Alternative executable filename
    cpuRequirement: string;      // CPU requirement (e.g., "AVX2", "SSE4.2")
    description: string;         // Description of this variant
  }>;
  
  // === Engine Type ===
  engineType?: "standard" | "tsume_solver" | "analysis";
  
  // === Usage Notes ===
  usageNotes?: {
    purpose?: string;            // Primary purpose
    notForPlay?: boolean;        // If true, not suitable for regular play
    [key: string]: any;          // Additional notes
  };
  
  // === Training Features ===
  trainingFeatures?: {
    skillLevelRange?: string;    // e.g., "0-20"
    eloRange?: string;           // e.g., "1000-3000"
    supportsWeakPlay: boolean;   // Can play at reduced strength
    notes?: string;              // Training-specific notes
  };
  
  // === Opening Book ===
  openingBook?: {
    format: string;              // Book format (e.g., "EPD", "DB")
    file: string;                // Book file path
    description: string;         // Book description
  };
  
  // === System Requirements ===
  systemRequirements?: {
    gpu?: string;                // GPU requirement
    cuda?: string;               // CUDA version
    cudnn?: string;              // cuDNN version
    tensorrt?: string;           // TensorRT version
    notes?: string;              // Additional requirements
  };
  
  // === CPU Optimization ===
  cpuOptimization?: {
    recommended: string;         // Recommended CPU features
    minimum: string;             // Minimum CPU features
    notes?: string;              // Optimization notes
  };
  
  // === Documentation ===
  documentation?: {
    readme?: string;             // README file path
    license?: string;            // LICENSE file path
    language?: string;           // Documentation language
  };
  
  // === Historical/Special ===
  historicalSignificance?: string;  // For historically important engines
}
```

---

## Complete Schema (TypeScript)

```typescript
interface EngineConfig {
  // Core Identity (Required)
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  
  // Execution (Required)
  executable: string;
  protocol: "USI";
  
  // Files (Required)
  evalFiles: string[];
  requiredFiles: string[];
  optionalFiles?: string[];
  
  // Features (Required)
  features: {
    nnue: boolean;
    ponder: boolean;
    multiPV: boolean;
    skillLevel: boolean;
    uciElo: boolean;
    openingBook: boolean;
    [key: string]: boolean;  // Allow custom feature flags
  };
  
  // Default Options (Required)
  defaultOptions: {
    [optionName: string]: string;
  };
  
  // Strength (Required)
  strength: {
    estimated_elo: number | "N/A";
    level: string;
    notes: string;
    minLevel: number;
    maxLevel: number;
  };
  
  // Strength Control (Required)
  strengthControl: {
    supported: boolean;
    methods: string[];
    notes: string;
  };
  
  // License (Required)
  license: string;
  
  // Optional Fields
  executableAlternatives?: Array<{
    file: string;
    cpuRequirement: string;
    description: string;
  }>;
  
  engineType?: "standard" | "tsume_solver" | "analysis";
  
  usageNotes?: {
    purpose?: string;
    notForPlay?: boolean;
    [key: string]: any;
  };
  
  trainingFeatures?: {
    skillLevelRange?: string;
    eloRange?: string;
    supportsWeakPlay: boolean;
    notes?: string;
  };
  
  openingBook?: {
    format: string;
    file: string;
    description: string;
  };
  
  systemRequirements?: {
    gpu?: string;
    cuda?: string;
    cudnn?: string;
    tensorrt?: string;
    notes?: string;
  };
  
  cpuOptimization?: {
    recommended: string;
    minimum: string;
    notes?: string;
  };
  
  documentation?: {
    readme?: string;
    license?: string;
    language?: string;
  };
  
  historicalSignificance?: string;
}
```

---

## Field Descriptions

### Core Identity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | ✅ | Unique identifier (lowercase, no spaces, e.g., "yaneuraou") |
| `name` | string | ✅ | Display name shown to users (e.g., "YaneuraOu NNUE") |
| `author` | string | ✅ | Engine author(s) |
| `version` | string | ✅ | Version number or identifier |
| `description` | string | ✅ | Brief description (1-2 sentences) |

### Execution

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `executable` | string | ✅ | Primary executable filename (e.g., "YaneuraOu.exe") |
| `protocol` | string | ✅ | Always "USI" for shogi engines |

### Files

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `evalFiles` | string[] | ✅ | Evaluation files (e.g., ["eval/nn.bin"]). Empty array if none. |
| `requiredFiles` | string[] | ✅ | All files required for engine to run (includes executable, eval files, DLLs) |
| `optionalFiles` | string[] | ❌ | Optional files like opening books |

### Features

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `features.nnue` | boolean | ✅ | Uses NNUE neural network evaluation |
| `features.ponder` | boolean | ✅ | Supports pondering (thinking on opponent's time) |
| `features.multiPV` | boolean | ✅ | Supports multiple principal variations |
| `features.skillLevel` | boolean | ✅ | Supports "Skill Level" USI option (0-20 scale) |
| `features.uciElo` | boolean | ✅ | Supports UCI_LimitStrength and UCI_Elo options |
| `features.openingBook` | boolean | ✅ | Has opening book support |

**Custom feature flags** can be added (e.g., `"tensorrt": true`, `"kppt": true`, `"tsumeSolver": true`).

### Default Options

Key-value pairs for USI options. These are sent to the engine during initialization.

**Common options:**
- `Hash`: Hash table size in MB (e.g., "1024")
- `Threads`: Number of threads (e.g., "4")
- `USI_Ponder`: Enable pondering (e.g., "false")
- `EvalDir`: Evaluation directory (e.g., "eval")
- `BookFile`: Opening book file (e.g., "books/shogi.epd")

### Strength

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `strength.estimated_elo` | number \| "N/A" | ✅ | Estimated Elo rating (e.g., 4000) or "N/A" for non-playing engines |
| `strength.level` | string | ✅ | Human-readable level (e.g., "superhuman", "professional", "amateur") |
| `strength.notes` | string | ✅ | Additional notes about strength |
| `strength.minLevel` | number | ✅ | Minimum strength level (1-10) the engine can play at |
| `strength.maxLevel` | number | ✅ | Maximum strength level (1-10) the engine can play at |

#### **10-Level Strength System**

The application uses a 10-level strength system based on shogi ranks and Elo ratings:

| Level | Rank | Elo Range | Description |
|-------|------|-----------|-------------|
| 10 | Superhuman | 3000+ | Beyond human capability |
| 9 | 7-Dan | 2300+ | Top professional level |
| 8 | 5-6 Dan | 2100-2299 | Strong professional |
| 7 | 3-4 Dan | 1800-2099 | Professional/Strong amateur |
| 6 | 1-2 Dan | 1600-1799 | Strong amateur |
| 5 | 3-1 Kyu | 1300-1599 | Intermediate |
| 4 | 6-4 Kyu | 1150-1299 | Advanced beginner |
| 3 | 9-7 Kyu | 1000-1149 | Beginner+ |
| 2 | 12-10 Kyu | 700-999 | Beginner |
| 1 | 15-13 Kyu | <700 | Absolute beginner |

**Usage:**
- Engines without strength control: Set `minLevel: 10, maxLevel: 10`
- Engines with full control: Set `minLevel: 1, maxLevel: 10`
- Engines with partial control: Set appropriate range (e.g., `minLevel: 5, maxLevel: 10`)

### Strength Control

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `strengthControl.supported` | boolean | ✅ | Whether engine supports strength adjustment |
| `strengthControl.methods` | string[] | ✅ | Array of methods: "skillLevel", "uciElo", "time", "hash", "threads" |
| `strengthControl.notes` | string | ✅ | Notes about how strength control works for this engine |

**Methods:**
- `"skillLevel"`: Engine supports Skill Level option (0-20)
- `"uciElo"`: Engine supports UCI_LimitStrength and UCI_Elo
- `"time"`: Strength controlled via time limits
- `"hash"`: Strength controlled via hash table size
- `"threads"`: Strength controlled via thread count

### Training Features

Only include if engine supports adjustable strength for training.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `trainingFeatures.skillLevelRange` | string | ❌ | Skill level range (e.g., "0-20") |
| `trainingFeatures.eloRange` | string | ❌ | Elo range (e.g., "1000-3000") |
| `trainingFeatures.supportsWeakPlay` | boolean | ✅ | Can play at reduced strength |
| `trainingFeatures.notes` | string | ❌ | Training-specific notes |

---

## Example Configurations

### Standard Engine (YaneuraOu)

```json
{
  "id": "yaneuraou",
  "name": "YaneuraOu NNUE",
  "author": "Motohiro Isozaki (Yaneurao)",
  "version": "7.6.3",
  "description": "World's strongest shogi engine, WCSC29 winner. Standard YaneuraOu with NNUE evaluation.",
  "executable": "YaneuraOu.exe",
  "protocol": "USI",
  "evalFiles": ["eval/nn.bin"],
  "requiredFiles": ["YaneuraOu.exe", "eval/nn.bin"],
  "features": {
    "nnue": true,
    "ponder": true,
    "multiPV": true,
    "skillLevel": false,
    "uciElo": false,
    "openingBook": false
  },
  "defaultOptions": {
    "Hash": "1024",
    "Threads": "4",
    "USI_Ponder": "false",
    "EvalDir": "eval"
  },
  "strength": {
    "estimated_elo": 4000,
    "level": "superhuman",
    "notes": "Requires nn.bin evaluation file. One of the strongest shogi engines available."
  },
  "license": "GPL-3.0"
}
```

### Training-Friendly Engine (Fairy-Stockfish)

```json
{
  "id": "fairy-stockfish",
  "name": "Fairy-Stockfish (Large Board)",
  "author": "Fabian Fichter",
  "version": "14.0.1",
  "description": "Multi-variant chess engine supporting shogi with NNUE evaluation. Excellent for learning and training.",
  "executable": "fairy-stockfish-largeboard_x86-64.exe",
  "protocol": "USI",
  "evalFiles": ["networks/shogi.nnue"],
  "requiredFiles": ["fairy-stockfish-largeboard_x86-64.exe", "networks/shogi.nnue"],
  "optionalFiles": ["books/shogi.epd"],
  "features": {
    "nnue": true,
    "ponder": true,
    "multiPV": true,
    "skillLevel": true,
    "uciElo": true,
    "openingBook": true
  },
  "defaultOptions": {
    "Hash": "256",
    "Threads": "2",
    "UCI_Variant": "shogi",
    "UCI_LimitStrength": "false",
    "Skill Level": "20",
    "EvalFile": "networks/shogi.nnue",
    "BookFile": "books/shogi.epd"
  },
  "strength": {
    "estimated_elo": 3800,
    "level": "superhuman",
    "notes": "With NNUE: ~3800 Elo. Supports skill level control (0-20) and UCI_Elo for training."
  },
  "trainingFeatures": {
    "skillLevelRange": "0-20",
    "eloRange": "1000-3000",
    "supportsWeakPlay": true,
    "notes": "Best engine for training purposes due to built-in strength control."
  },
  "openingBook": {
    "format": "EPD",
    "file": "books/shogi.epd",
    "description": "Standard shogi opening book in EPD format"
  },
  "license": "GPL-3.0"
}
```

### Specialized Engine (SeoTsume)

```json
{
  "id": "seotsume",
  "name": "SeoTsume (脊尾詰)",
  "author": "Masahiro Seo (脊尾昌宏)",
  "version": "1.2",
  "description": "Specialized tsume-shogi (mate problem) solver. Not for regular play.",
  "executable": "SeoTsume.exe",
  "protocol": "USI",
  "evalFiles": [],
  "requiredFiles": ["SeoTsume.exe"],
  "features": {
    "nnue": false,
    "ponder": false,
    "multiPV": false,
    "skillLevel": false,
    "uciElo": false,
    "openingBook": false,
    "tsumeSolver": true
  },
  "defaultOptions": {
    "Hash": "224",
    "Do_YoTsume_Search": "false",
    "YoTsume_Second": "60"
  },
  "engineType": "tsume_solver",
  "usageNotes": {
    "purpose": "Tsume-shogi (mate problem) solving only",
    "notForPlay": true,
    "hashRecommendation": "224MB minimum. Increase for harder problems."
  },
  "strength": {
    "estimated_elo": "N/A",
    "level": "tsume_specialist",
    "notes": "Not designed for regular play. Specialized for solving mate problems."
  },
  "license": "Proprietary (free for non-commercial use)"
}
```

---

## Validation Rules

1. **`id`** must be unique across all engines
2. **`executable`** must exist in the engine's directory
3. All paths in **`evalFiles`**, **`requiredFiles`**, **`optionalFiles`** are relative to the engine directory
4. **`protocol`** must be "USI"
5. **`features`** object must contain all required boolean fields
6. **`defaultOptions`** values must be strings (even for numbers)
7. **`strength.estimated_elo`** must be a number or the string "N/A"

---

## Usage by Engine Management System

The Engine Management System will:

1. **Scan** `backend/engines/` for subdirectories
2. **Load** `config.json` from each subdirectory
3. **Validate** against this schema
4. **Display** engines to users based on:
   - `name`, `description`, `strength.level`
   - Filter out engines with `usageNotes.notForPlay: true` from regular play selection
5. **Initialize** engines using:
   - `executable` path
   - `defaultOptions` for USI configuration
6. **Enable features** based on:
   - `features` flags (show/hide UI controls)
   - `trainingFeatures` for strength adjustment
7. **Handle requirements**:
   - Check `requiredFiles` exist before allowing engine selection
   - Display `systemRequirements` warnings if present

---

## Adding Custom Engines

See `docs/ADDING_CUSTOM_ENGINES.md` for instructions on how users can add their own engines.
