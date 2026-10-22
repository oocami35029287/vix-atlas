import json
from pathlib import Path
from server import load_data
root=Path(__file__).resolve().parent
sample=load_data('SPY','2020-01-01','2026-10-22')
(root/'sample.json').write_text(json.dumps(sample),encoding='utf-8')
page=(root/'page.html').read_text()
page=page.replace('/* ENGINE_PLACEHOLDER */',(root/'engine.js').read_text())
page=page.replace('/* SAMPLE_PLACEHOLDER */','const SAMPLE = '+json.dumps(sample).replace('<','\\u003c')+';')
(root/'index.html').write_text(page,encoding='utf-8')
print('HTML ready:',len(sample['prices']),'stock rows;',len(sample['vix']),'VIX rows; range',sample['prices'][0]['date'],sample['prices'][-1]['date'])
