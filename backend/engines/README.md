# Shogi Engines

This directory contains Shogi engine binaries and their configuration files. **Engine executables and evaluation files are NOT included in version control** due to their large size.

## 📁 Directory Structure

Each engine should be in its own subdirectory with this structure:

```
engines/
├── engine-name/
│   ├── config.json          ← Engine configuration (included in Git)
│   ├── engine.exe           ← Engine binary (NOT in Git)
│   ├── eval/                ← Evaluation files (NOT in Git)
│   │   └── *.bin
│   └── *.db                 ← Opening books (NOT in Git)
```

## 🚀 Setting Up Engines

### Recommended Engines

1. **YaneuraOu** - Strong NNUE engine
   - Download from: https://github.com/yaneurao/YaneuraOu
   - Requires eval files

2. **Fairy-Stockfish** - Multi-variant engine with Shogi support
   - Download from: https://github.com/fairy-stockfish/Fairy-Stockfish
   - Built-in evaluation

3. **Apery** - Traditional evaluation engine
   - Download from: https://github.com/HiraokaTakuya/apery
   - Requires eval files

4. **Fukauraou** - GPU-accelerated NNUE engine
   - Download from: https://github.com/Tama4649/Kristallweizen
   - Requires GPU and NNUE files

### Installation Steps

1. Create a directory for your engine in `backend/engines/`
2. Place the engine executable in that directory
3. Create/verify the `config.json` (see below)
4. Download required evaluation files if needed
5. Restart the backend to detect the new engine

### Example config.json

See existing engine configs in this directory. Required fields:

```json
{
  "id": "engine-id",
  "name": "Engine Name",
  "author": "Author Name",
  "version": "1.0",
  "description": "Brief description",
  "executablePath": "engines/engine-id/engine.exe",
  "protocol": "usi",
  "defaultOptions": {
    "Hash": "1024",
    "Threads": "4"
  },
  "strength": {
    "estimated_elo": 3000,
    "level": "Professional",
    "minLevel": 1,
    "maxLevel": 10
  },
  "strengthControl": {
    "supported": true,
    "methods": ["skillLevel", "uciElo"]
  },
  "features": {
    "analysis": true,
    "multiPV": true,
    "ponder": true
  }
}
```

## 📝 Notes

- **config.json files ARE tracked in Git** for documentation
- Engine binaries (.exe) are platform-specific
- Evaluation files can be 100MB-2GB+ each
- Opening book databases (.db) can be very large
- User preferences are saved in `backend/engine_preferences.json` (also ignored)

## 🔧 Testing Engines

Use the inspection script to verify engines are working:

```bash
cd backend
python inspect_engine_options.py
```

This will show all detected engines and their configurable options.

## 🆘 Troubleshooting

**Engine not detected:**
- Check `config.json` exists and is valid JSON
- Verify `executablePath` is correct
- Ensure engine binary has execute permissions

**Engine fails to start:**
- Check if required eval files are present
- Verify eval file paths in `config.json` `defaultOptions`
- Check backend console for error messages

**Wrong options shown:**
- Run `inspect_engine_options.py` to see actual options
- Some engines require specific default options to start

## 📚 Resources

- [USI Protocol Specification](http://hgm.nubati.net/usi.html)
- [YaneuraOu Documentation](https://github.com/yaneurao/YaneuraOu/blob/master/docs/USI.md)
- [Shogi Engine List](https://github.com/TadaoYamaoka/cshogi)
