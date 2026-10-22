"""Fail closed: only the code artifact may be deployed; Git holds no market snapshots."""
import re
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
files={str(p.relative_to(ROOT/'public')) for p in (ROOT/'public').rglob('*') if p.is_file()}
assert files=={'index.html','.nojekyll'}, f'Unexpected public files: {files}'
html=(ROOT/'public/index.html').read_text()
for forbidden in ('const SAMPLE', '/* SAMPLE_PLACEHOLDER */', './data/', 'data/chip_report.json'):
    assert forbidden not in html, f'Embedded / snapshot data reference: {forbidden}'
assert not re.search(r'"date"\s*:\s*"\d{4}-\d{2}-\d{2}"\s*,\s*"(?:open|close)"\s*:\s*\d',html), 'Embedded observations'
tracked=subprocess.check_output(['git','ls-files'],cwd=ROOT,text=True).splitlines()
assert not any(p.startswith(('data/','.private/','public/')) or p in {'sample.json','index.html'} for p in tracked), 'Generated data/build still tracked'
for file in (ROOT/'.github/workflows').glob('*.yml'):
    text=file.read_text()
    assert 'contents: write' not in text and 'git push' not in text and 'git add data' not in text, f'CI data write: {file.name}'
    if file.name!='pages.yml':
        assert 'upload-artifact' not in text and 'actions/cache' not in text, 'Data collection artifact/cache forbidden'
print('PASS: code-only Git and Pages artifact, no snapshot dependencies or CI data writes')
