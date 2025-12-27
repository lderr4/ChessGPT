#!/usr/bin/env python3
"""
Quick script to run performance tests for AnalysisService

Usage:
    python run_performance_tests.py

Or use pytest directly:
    pytest tests/test_analysis_service_performance.py -v -s
"""
import subprocess
import sys

if __name__ == "__main__":
    print("🚀 Running AnalysisService Performance Tests...")
    print("=" * 60)
    
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/test_analysis_service_performance.py",
            "-v",
            "-s",
            "--tb=short"
        ],
        cwd="."
    )
    
    sys.exit(result.returncode)

