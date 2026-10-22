"""Offline, code-only Pages build. No source observations or network dependency."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
ROOT = Path(__file__).resolve().parent

def build(output='public'):
    target = ROOT / output
    target.mkdir(parents=True, exist_ok=True)
    page = (ROOT / 'page.html').read_text()
    files = ['engine.js', 'research_core.js', 'bb_engine.js', 'chip_engine.js',
             'research_statistics.js', 'rev_mom_engine.js', 'data_client.js']
    try:
        sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, stderr=subprocess.DEVNULL, text=True).strip()
        dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True))
    except (OSError, subprocess.CalledProcessError):
        sha, dirty = None, True
    meta = {'code_sha': None if dirty else sha, 'base_git_sha': sha, 'dirty': dirty,
            'engine_hash': hashlib.sha256(''.join((ROOT / f).read_text() for f in files).encode()).hexdigest()}
    page = page.replace('/* BUILD_PLACEHOLDER */', 'const ATLAS_BUILD = '+json.dumps(meta)+';')
    page = page.replace('/* ENGINE_PLACEHOLDER */', '\n'.join((ROOT / f).read_text() for f in files))
    page = page.replace('/* APP_PLACEHOLDER */', (ROOT / 'app.js').read_text())
    page = page.replace('/* STYLE_PLACEHOLDER */', (ROOT / 'style.css').read_text())
    if 'PLACEHOLDER' in page:
        raise ValueError('Unresolved placeholder')
    (target / 'index.html').write_text(page)
    (target / '.nojekyll').touch()
    print(f'Built code-only {output}/index.html ({len(page):,} characters)')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='public')
    build(parser.parse_args().output)
