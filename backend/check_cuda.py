"""
CUDA Detection Utility

Checks for NVIDIA GPU and CUDA installation.
"""

import subprocess
import platform
import os


def check_nvidia_gpu():
    """Check if an NVIDIA GPU is present."""
    try:
        if platform.system() == "Windows":
            # Try nvidia-smi on Windows
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                gpu_names = [name.strip() for name in result.stdout.strip().split('\n')]
                return True, gpu_names
        else:
            # Linux/Mac
            result = subprocess.run(
                ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                gpu_names = [name.strip() for name in result.stdout.strip().split('\n')]
                return True, gpu_names
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        pass
    
    return False, []


def check_cuda_installation():
    """Check if CUDA is installed."""
    try:
        # Check for CUDA via nvidia-smi
        result = subprocess.run(
            ["nvidia-smi"],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0:
            # Extract CUDA version from nvidia-smi output
            output = result.stdout
            if "CUDA Version:" in output:
                # Parse CUDA version
                for line in output.split('\n'):
                    if "CUDA Version:" in line:
                        cuda_version = line.split("CUDA Version:")[1].strip().split()[0]
                        return True, cuda_version
            return True, "Unknown"
    except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
        pass
    
    # Check for CUDA environment variables
    cuda_path = os.environ.get('CUDA_PATH') or os.environ.get('CUDA_HOME')
    if cuda_path and os.path.exists(cuda_path):
        return True, "Detected via CUDA_PATH"
    
    return False, None


def get_cuda_status():
    """Get complete CUDA/GPU status for Fukauraou engine."""
    has_gpu, gpu_names = check_nvidia_gpu()
    has_cuda, cuda_version = check_cuda_installation()
    
    status = {
        "hasGPU": has_gpu,
        "gpuNames": gpu_names,
        "hasCUDA": has_cuda,
        "cudaVersion": cuda_version,
        "ready": has_gpu and has_cuda,
        "warnings": []
    }
    
    # Generate warnings
    if not has_gpu:
        status["warnings"].append("No NVIDIA GPU detected. Fukauraou requires an NVIDIA GPU with CUDA support.")
    elif not has_cuda:
        status["warnings"].append("CUDA not detected. Please install CUDA 12.x from NVIDIA's website.")
    
    return status


if __name__ == "__main__":
    # Test the detection
    status = get_cuda_status()
    print("CUDA Status Check")
    print("=" * 50)
    print(f"NVIDIA GPU Present: {status['hasGPU']}")
    if status['gpuNames']:
        print(f"GPU(s): {', '.join(status['gpuNames'])}")
    print(f"CUDA Installed: {status['hasCUDA']}")
    if status['cudaVersion']:
        print(f"CUDA Version: {status['cudaVersion']}")
    print(f"\nReady for Fukauraou: {status['ready']}")
    print("\nNote: TensorRT DLLs are bundled with the Fukauraou model.")
    if status['warnings']:
        print("\nWarnings:")
        for warning in status['warnings']:
            print(f"  ⚠ {warning}")
