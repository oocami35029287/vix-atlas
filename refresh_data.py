"""Rate-limited, failure-isolated static snapshots with atomic writes."""
import argparse
from concurrent.futures import ThreadPoolExecutor,as_completed
from datetime import date,datetime,timezone
import json
from pathlib import Path
import re
import time
from server import load_data,load_vix
ROOT=Path(__file__).resolve().parent

def atomic_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    temporary=path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    temporary.replace(path)

def refresh(symbols,only_missing=False):
    vix=load_vix();atomic_json(ROOT/'data/vix.json',{'source':'Cboe VIX History','fetchedAt':datetime.now(timezone.utc).isoformat(),'vix':vix})
    errors=[];ok=[]
    def one(symbol):
        path=ROOT/'data/stocks'/f'{symbol}.json'
        if only_missing and path.exists():return symbol
        for attempt in range(3):
            try:
                data=load_data(symbol,'2020-01-01',date.today().isoformat()).copy()
                data.pop('vix',None)
                for row in data['prices']:
                    for key in ['open','high','low','close']:
                        if isinstance(row.get(key),(int,float)):row[key]=round(row[key],5)
                atomic_json(path,data);time.sleep(.25);return symbol
            except Exception:
                if attempt==2:raise
                time.sleep(1+attempt)
    with ThreadPoolExecutor(max_workers=3) as pool:
        tasks={pool.submit(one,s):s for s in symbols}
        for task in as_completed(tasks):
            symbol=tasks[task]
            try:ok.append(task.result());print(symbol,'ok',flush=True)
            except Exception as e:errors.append({'symbol':symbol,'error':str(e)[:160]});print(symbol,'FAILED',str(e)[:100],flush=True)
    manifest={'schema_version':2,'updated_at':datetime.now(timezone.utc).isoformat(),'requested':len(symbols),'successful':len(ok),'failed':errors,'partial':bool(errors),'vix_path':'data/vix.json','snapshot_model':'current historical revisions; split-adjusted; dividends excluded'}
    atomic_json(ROOT/'data/manifest.json',manifest)
    from scripts.build_catalog import build
    build()
    print(json.dumps(manifest),flush=True)
    if not ok:raise RuntimeError('No datasets updated; previous valid snapshots retained')
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--symbols',default='');parser.add_argument('--watchlist',action='store_true');parser.add_argument('--only-missing',action='store_true');parser.add_argument('--market',choices=['TW','US','all'],default='all');args=parser.parse_args()
    if args.watchlist:
        from scripts.build_catalog import US_WATCH,TW_WATCH
        symbols=TW_WATCH if args.market=='TW' else US_WATCH if args.market=='US' else TW_WATCH+US_WATCH
    else:symbols=[s.strip().upper() for s in args.symbols.split(',') if s.strip()]
    symbols=list(dict.fromkeys(symbols))
    if not symbols or len(symbols)>300 or any(not re.fullmatch(r'[A-Z0-9.^=-]{1,24}',s) for s in symbols):parser.error('Provide 1–300 valid tickers, or --watchlist')
    refresh(symbols,args.only_missing)
