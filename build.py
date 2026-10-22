"""Build the self-contained site from checked-in inputs, with no network."""
import argparse
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parent

def build(refresh=False):
    if refresh:
        from datetime import date
        from server import load_data
        sample=load_data('SPY','2020-01-01',date.today().isoformat())
        (ROOT/'sample.json').write_text(json.dumps(sample),encoding='utf-8')
    sample=json.loads((ROOT/'sample.json').read_text())
    page=(ROOT/'page.html').read_text()
    engines='\n'.join((ROOT/f).read_text() for f in ['engine.js','research_core.js','bb_engine.js','chip_engine.js'])
    page=page.replace('/* ENGINE_PLACEHOLDER */',engines)
    page=page.replace('/* SAMPLE_PLACEHOLDER */','const SAMPLE = '+json.dumps(sample).replace('<','\\u003c')+';')
    page=page.replace('/* APP_PLACEHOLDER */',(ROOT/'app.js').read_text())
    page=page.replace('/* STYLE_PLACEHOLDER */',(ROOT/'style.css').read_text())
    if 'PLACEHOLDER' in page:raise ValueError('Unresolved build placeholder')
    (ROOT/'index.html').write_text(page,encoding='utf-8')
    print(f'Built index.html: {len(sample["prices"])} default rows, {len(page):,} characters')

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--refresh',action='store_true')
    build(parser.parse_args().refresh)
