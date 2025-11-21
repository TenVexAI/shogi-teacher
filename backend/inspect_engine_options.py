"""
Engine Options Inspector

This script discovers all available engines and displays their USI options
in a readable format for review and understanding.
"""

import sys
from pathlib import Path
from engine_manager import EngineManager
from engine_manager.usi_protocol import USIOption

# Common USI option descriptions
OPTION_DESCRIPTIONS = {
    "Hash": "Memory allocated for transposition table (MB). Higher values improve search but use more RAM.",
    "Threads": "Number of CPU threads to use for search. More threads = faster search on multi-core systems.",
    "MultiPV": "Number of best lines (principal variations) to calculate. 1 = only best move, 3+ = multiple alternatives.",
    "USI_Ponder": "Think during opponent's turn. Improves strength but may cause issues in some GUIs.",
    "UCI_Ponder": "Think during opponent's turn (UCI variant).",
    "Ponder": "Think during opponent's turn.",
    "OwnBook": "Use engine's built-in opening book. Disable to use external book or pure calculation.",
    "BookFile": "Path to opening book file. Engine will consult this for opening moves.",
    "BookDepth": "Maximum number of moves to use book for. After this, engine calculates freely.",
    "Skill Level": "Strength adjustment (0-20). Lower = weaker play, 20 = full strength.",
    "UCI_LimitStrength": "Enable strength limiting (true/false). Must be true to use UCI_Elo.",
    "UCI_Elo": "Target playing strength in Elo rating. Only works when UCI_LimitStrength is true.",
    "Contempt": "Willingness to play for a draw. Positive = avoid draws, negative = accept draws.",
    "EvalDir": "Directory containing evaluation files (neural network weights, etc).",
    "Eval_Dir": "Directory containing evaluation files (neural network weights, etc).",
    "EvalFile": "Path to evaluation file (neural network, etc).",
    "NetworkFile": "Path to neural network file for NNUE evaluation.",
    "MinimumThinkingTime": "Minimum time to think per move (milliseconds).",
    "MaximumThinkingTime": "Maximum time to think per move (milliseconds).",
    "SlowMover": "Time management. Higher = use more time per move, lower = faster moves.",
    "Move Overhead": "Safety buffer for network lag (milliseconds). Prevents time losses.",
    "Syzygy Path": "Directory containing Syzygy endgame tablebases.",
    "Clear Hash": "Button to clear the transposition table.",
    "nodestime": "Nodes per millisecond for engine testing.",
    "BookMoves": "Number of book moves to play before switching to calculation.",
    "Best Book Line": "Always play the best line from opening book (true/false).",
    "BookDepth": "Maximum ply depth to use opening book.",
}


def format_option_type(opt: USIOption) -> str:
    """Format option type with relevant constraints."""
    if opt.type == "spin":
        return f"Number (range: {opt.min} to {opt.max}, default: {opt.default})"
    elif opt.type == "check":
        return f"Boolean (default: {opt.default})"
    elif opt.type == "combo":
        vars_str = ", ".join(opt.var) if opt.var else "none"
        return f"Choice (options: {vars_str}, default: {opt.default})"
    elif opt.type == "string":
        return f"Text (default: '{opt.default}')"
    elif opt.type == "button":
        return "Button (triggers action)"
    else:
        return f"Unknown type: {opt.type}"


def get_option_description(option_name: str) -> str:
    """Get description for common USI options."""
    # Direct match
    if option_name in OPTION_DESCRIPTIONS:
        return OPTION_DESCRIPTIONS[option_name]
    
    # Partial matches
    name_lower = option_name.lower()
    if "hash" in name_lower:
        return "Memory allocation setting (likely for transposition table)."
    elif "thread" in name_lower:
        return "Controls number of CPU threads used."
    elif "book" in name_lower:
        return "Opening book related setting."
    elif "eval" in name_lower or "network" in name_lower:
        return "Evaluation function or neural network setting."
    elif "ponder" in name_lower:
        return "Controls thinking during opponent's turn."
    elif "contempt" in name_lower:
        return "Draw avoidance setting."
    elif "time" in name_lower:
        return "Time management related setting."
    elif "skill" in name_lower or "elo" in name_lower or "strength" in name_lower:
        return "Playing strength adjustment."
    
    return "No description available."


def inspect_engines():
    """Inspect all engines and display their options."""
    print("\n" + "="*80)
    print("ENGINE OPTIONS INSPECTOR")
    print("="*80)
    print("\nDiscovering engines...\n")
    
    # Initialize engine manager
    manager = EngineManager()
    engines = manager.discover_engines()
    
    if not engines:
        print("❌ No engines found!")
        return
    
    print(f"✓ Found {len(engines)} engine(s)\n")
    
    # Inspect each engine
    for i, engine_config in enumerate(engines, 1):
        print("\n" + "="*80)
        print(f"ENGINE {i}/{len(engines)}: {engine_config.name}")
        print("="*80)
        print(f"Author:      {engine_config.author}")
        print(f"Version:     {engine_config.version}")
        print(f"ID:          {engine_config.id}")
        print(f"Description: {engine_config.description}")
        print(f"Executable:  {engine_config.executablePath}")
        
        # Strength info
        print(f"\nStrength:")
        print(f"  Level:     {engine_config.strength.get('level', 'N/A')}")
        print(f"  Est. Elo:  {engine_config.strength.get('estimated_elo', 'N/A')}")
        print(f"  Min Level: {engine_config.strength.get('minLevel', 10)}")
        print(f"  Max Level: {engine_config.strength.get('maxLevel', 10)}")
        
        # Strength control
        if engine_config.strengthControl.get('supported'):
            methods = engine_config.strengthControl.get('methods', [])
            print(f"  Control:   {', '.join(methods)}")
        else:
            print(f"  Control:   Not supported")
        
        print("\n" + "-"*80)
        print("CONFIGURABLE OPTIONS:")
        print("-"*80)
        
        # Try to start engine and get options
        try:
            print(f"\nStarting {engine_config.name}...")
            success = manager._start_engine(engine_config.id)
            
            if not success:
                print(f"❌ Failed to start {engine_config.name}")
                continue
            
            process = manager.running_engines.get(engine_config.id)
            if not process:
                print(f"❌ Engine process not available")
                continue
            
            options = process.usi_options
            
            if not options:
                print("ℹ️  No configurable options available (engine uses defaults only)")
            else:
                print(f"✓ Found {len(options)} configurable option(s)\n")
                
                for j, opt in enumerate(options, 1):
                    print(f"\n[{j}] {opt.name}")
                    print(f"    Type:        {format_option_type(opt)}")
                    print(f"    Description: {get_option_description(opt.name)}")
            
            # Stop engine
            manager._stop_engine(engine_config.id)
            print(f"\n✓ Stopped {engine_config.name}")
            
        except Exception as e:
            print(f"❌ Error inspecting {engine_config.name}: {e}")
            import traceback
            traceback.print_exc()
        
        print()
    
    print("\n" + "="*80)
    print("INSPECTION COMPLETE")
    print("="*80)
    print("\n💡 Tip: Common settings to adjust:")
    print("   • Hash: More memory = better search (512MB-2048MB typical)")
    print("   • Threads: Match your CPU cores (4-8 typical)")
    print("   • MultiPV: Set to 3-5 to see multiple move options")
    print("   • Skill Level/UCI_Elo: Adjust playing strength")
    print()


if __name__ == "__main__":
    try:
        inspect_engines()
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
