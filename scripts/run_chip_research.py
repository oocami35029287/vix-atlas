"""Orchestration only; all research calculations run through the shared JS engine."""
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
subprocess.run(['node',str(ROOT/'scripts/run_chip_research.cjs'),*sys.argv[1:]],cwd=ROOT,check=True)
