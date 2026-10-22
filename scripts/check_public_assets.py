"""Fail deployment on broken assets, raw chip publication or stale inline builds."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]

def main():
    before=(ROOT/'index.html').read_bytes()
    subprocess.run([sys.executable,str(ROOT/'build.py')],cwd=ROOT,check=True)
    if before!=(ROOT/'index.html').read_bytes():raise ValueError('Generated HTML is stale: run build.py and commit index.html')
    catalog=json.loads((ROOT/'data/symbol_catalog.json').read_text())
    snapshots=[r for r in catalog['symbols'] if r.get('has_snapshot')]
    for r in snapshots:
        path=ROOT/r['snapshot_path']
        if not path.is_file():raise ValueError('Missing snapshot: '+str(path))
        data=json.loads(path.read_text());dates=[v['date'] for v in data['prices']]
        if dates!=sorted(set(dates)):raise ValueError('Invalid dates: '+str(path))
    counts={market:sum(r['market']==market for r in snapshots) for market in ['TW','US']}
    if any(v<100 for v in counts.values()):raise ValueError('Expected at least 100 TW + 100 US snapshots')
    report=json.loads((ROOT/'data/chip_report.json').read_text())
    if report.get('raw_data_included') is not False or report['gates']['G0'] is not False:raise ValueError('Proxy report cannot claim historical evidence')
    engine_hash=hashlib.sha256((ROOT/'chip_engine.js').read_bytes()).hexdigest()
    if report['manifest']['engine_hash']!=engine_hash:raise ValueError('Research report must be regenerated after engine changes')
    if len(report['runs'])!=9:raise ValueError('All nine registered horizons must be present')
    forbidden=('foreign_net_shares','trust_net_shares','margin_balance_shares','chip_versions','raw_hash')
    for p in (ROOT/'data').rglob('*.json'):
        text=p.read_text()
        if any('"'+key+'"' in text for key in forbidden):raise ValueError('Raw chip observations in public asset: '+str(p))
    print('PASS public assets:',counts,'nine proxy reports, engine hash, no raw chip data, reproducible HTML')

if __name__=='__main__':main()
