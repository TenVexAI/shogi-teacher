# Adding Custom Engines - User Guide

This guide explains how to add your own USI-compatible shogi engines to the application.

---

## Prerequisites

- A USI-compatible shogi engine executable
- Any required evaluation files (e.g., `.bin`, `.nnue` files)
- Basic understanding of the engine's requirements

---

## Step-by-Step Instructions

### 1. Prepare Your Engine Files

Gather all files needed for your engine to run:
- Engine executable (`.exe` on Windows)
- Evaluation files (usually in an `eval/` or `networks/` folder)
- Opening book files (optional)
- Any DLL dependencies (especially for GPU-accelerated engines)
- README or documentation files (optional)

### 2. Create Engine Folder

Navigate to the `backend/engines/` directory and create a new folder for your engine.

**Naming convention**: Use lowercase, no spaces (e.g., `myengine`, `custom-engine-1`)

```
backend/engines/
  └── myengine/          ← Create this folder
```

### 3. Copy Engine Files

Copy all your engine files into the new folder:

```
backend/engines/
  └── myengine/
      ├── MyEngine.exe
      ├── eval/
      │   └── nn.bin
      └── (other files)
```

### 4. Create `config.json`

Create a `config.json` file in your engine folder following the schema defined in `ENGINE_CONFIG_SCHEMA.md`.

**Minimum required `config.json`:**

```json
{
  "id": "myengine",
  "name": "My Custom Engine",
  "author": "Engine Author Name",
  "version": "1.0",
  "description": "Brief description of the engine",
  "executable": "MyEngine.exe",
  "protocol": "USI",
  "evalFiles": ["eval/nn.bin"],
  "requiredFiles": [
    "MyEngine.exe",
    "eval/nn.bin"
  ],
  "features": {
    "nnue": true,
    "ponder": true,
    "multiPV": true,
    "skillLevel": false,
    "uciElo": false,
    "openingBook": false
  },
  "defaultOptions": {
    "Hash": "512",
    "Threads": "2"
  },
  "strength": {
    "estimated_elo": 3000,
    "level": "professional",
    "notes": "Add any notes about the engine's strength"
  },
  "license": "GPL-3.0"
}
```

### 5. Customize Configuration

Adjust the `config.json` fields based on your engine:

#### **Core Identity**
- `id`: Unique identifier (must match folder name)
- `name`: Display name shown to users
- `author`: Engine author(s)
- `version`: Version number
- `description`: Brief description (1-2 sentences)

#### **Execution**
- `executable`: Filename of the engine executable
- `protocol`: Always "USI" for shogi engines

#### **Files**
- `evalFiles`: List of evaluation files (relative paths)
- `requiredFiles`: All files needed for engine to run
- `optionalFiles`: Optional files like opening books

#### **Features**
Set to `true` or `false` based on what your engine supports:
- `nnue`: Uses NNUE neural network evaluation
- `ponder`: Supports pondering (thinking on opponent's time)
- `multiPV`: Supports multiple principal variations
- `skillLevel`: Supports "Skill Level" option (0-20)
- `uciElo`: Supports UCI_LimitStrength and UCI_Elo
- `openingBook`: Has opening book support

#### **Default Options**
USI options to set when starting the engine:
```json
"defaultOptions": {
  "Hash": "1024",
  "Threads": "4",
  "USI_Ponder": "false",
  "EvalDir": "eval"
}
```

**Common options:**
- `Hash`: Hash table size in MB
- `Threads`: Number of CPU threads
- `USI_Ponder`: Enable pondering
- `EvalDir`: Path to evaluation files
- `BookFile`: Path to opening book

#### **Strength**
- `estimated_elo`: Estimated Elo rating (number or "N/A")
- `level`: Human-readable level (e.g., "amateur", "professional", "superhuman")
- `notes`: Additional notes about strength

### 6. Verify File Paths

Ensure all paths in `requiredFiles` and `evalFiles` are correct relative to the engine folder:

```json
"requiredFiles": [
  "MyEngine.exe",           ← In root of engine folder
  "eval/nn.bin",            ← In eval/ subfolder
  "cudart64_12.dll"         ← DLL in root
]
```

### 7. Test Engine (Optional but Recommended)

Before adding to the application, test your engine manually:

```bash
# Navigate to engine folder
cd backend/engines/myengine

# Run engine
./MyEngine.exe

# Type 'usi' and press Enter
# Engine should respond with:
# id name ...
# id author ...
# option name ...
# usiok

# Type 'quit' to exit
```

### 8. Restart Application

Restart the Shogi Teacher application. The engine discovery system will automatically:
1. Scan the `backend/engines/` directory
2. Load and validate your `config.json`
3. Verify required files exist
4. Add your engine to the available engines list

### 9. Select Your Engine

In the application:
1. Open engine configuration
2. Your custom engine should appear in the dropdown
3. Select it for Black or White
4. Start playing!

---

## Example Configurations

### Standard NNUE Engine

```json
{
  "id": "myengine",
  "name": "My Engine NNUE",
  "author": "John Doe",
  "version": "2.0",
  "description": "Strong NNUE-based shogi engine",
  "executable": "MyEngine.exe",
  "protocol": "USI",
  "evalFiles": ["eval/nn.bin"],
  "requiredFiles": ["MyEngine.exe", "eval/nn.bin"],
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
    "EvalDir": "eval"
  },
  "strength": {
    "estimated_elo": 3500,
    "level": "professional",
    "notes": "Strong professional-level play"
  },
  "license": "GPL-3.0"
}
```

### Engine with Opening Book

```json
{
  "id": "bookengine",
  "name": "Book Engine",
  "author": "Jane Smith",
  "version": "1.5",
  "description": "Engine with extensive opening book",
  "executable": "BookEngine.exe",
  "protocol": "USI",
  "evalFiles": ["eval/KKP.bin", "eval/KPP.bin"],
  "requiredFiles": [
    "BookEngine.exe",
    "eval/KKP.bin",
    "eval/KPP.bin"
  ],
  "optionalFiles": ["books/openings.db"],
  "features": {
    "nnue": false,
    "ponder": true,
    "multiPV": true,
    "skillLevel": false,
    "uciElo": false,
    "openingBook": true
  },
  "defaultOptions": {
    "Hash": "512",
    "Threads": "2",
    "BookFile": "books/openings.db",
    "BookMoves": "16"
  },
  "openingBook": {
    "format": "DB",
    "file": "books/openings.db",
    "description": "Custom opening book"
  },
  "strength": {
    "estimated_elo": 3200,
    "level": "strong_amateur",
    "notes": "Strong opening play, good for learning"
  },
  "license": "MIT"
}
```

### GPU-Accelerated Engine

```json
{
  "id": "gpuengine",
  "name": "GPU Engine",
  "author": "AI Research Lab",
  "version": "3.0",
  "description": "GPU-accelerated deep learning engine",
  "executable": "GPUEngine.exe",
  "protocol": "USI",
  "evalFiles": [],
  "requiredFiles": [
    "GPUEngine.exe",
    "cudart64_12.dll",
    "cudnn64_9.dll",
    "nvinfer_10.dll"
  ],
  "features": {
    "nnue": false,
    "tensorrt": true,
    "gpu": true,
    "ponder": true,
    "multiPV": true,
    "skillLevel": false,
    "uciElo": false,
    "openingBook": false
  },
  "defaultOptions": {
    "Hash": "2048",
    "Threads": "4"
  },
  "systemRequirements": {
    "gpu": "NVIDIA GPU with CUDA support",
    "cuda": "CUDA 12.x",
    "cudnn": "cuDNN 9.x",
    "tensorrt": "TensorRT 10.x",
    "notes": "Requires NVIDIA GPU. Will not run without compatible GPU."
  },
  "strength": {
    "estimated_elo": 4200,
    "level": "superhuman",
    "notes": "Extremely strong but requires NVIDIA GPU"
  },
  "license": "Proprietary"
}
```

---

## Troubleshooting

### Engine Not Appearing

**Problem**: Your engine doesn't show up in the engine list.

**Solutions**:
1. Check that `config.json` exists in the engine folder
2. Verify JSON syntax is valid (use a JSON validator)
3. Ensure `id` field matches the folder name
4. Check application logs for validation errors
5. Restart the application

### Missing Files Error

**Problem**: Error message about missing required files.

**Solutions**:
1. Verify all files in `requiredFiles` exist
2. Check file paths are relative to engine folder
3. Ensure file names match exactly (case-sensitive on Unix)
4. For DLLs, make sure they're in the correct location

### Engine Won't Start

**Problem**: Engine selected but won't start playing.

**Solutions**:
1. Test engine manually using command line
2. Check that executable has execute permissions (Unix/Mac)
3. Verify all DLL dependencies are present (Windows)
4. Check system requirements (GPU engines)
5. Review application logs for error messages

### Wrong Engine Options

**Problem**: Engine doesn't respond to configuration options.

**Solutions**:
1. Test engine with `usi` command to see available options
2. Update `defaultOptions` to match engine's actual options
3. Check option names match exactly (case-sensitive)
4. Verify option values are strings in JSON

---

## Advanced: Optional Fields

See `ENGINE_CONFIG_SCHEMA.md` for complete documentation of optional fields:

- `executableAlternatives`: Multiple CPU-optimized versions
- `engineType`: Special engine types (tsume solver, analysis)
- `usageNotes`: Additional usage information
- `trainingFeatures`: Strength control capabilities
- `cpuOptimization`: CPU requirements
- `documentation`: README/license file references

---

## Getting Help

If you encounter issues:
1. Check `ENGINE_CONFIG_SCHEMA.md` for complete schema documentation
2. Review example configs in `backend/engines/` folders
3. Verify your engine is USI-compatible
4. Check application logs for detailed error messages

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-20
