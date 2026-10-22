"""Refresh static market datasets for GitHub Pages."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import json
from pathlib import Path
import re
from server import load_data
ROOT = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--symbols', default='SPY,QQQ,AAPL,NVDA,MSFT,TSLA,AMD,2330.TW,2317.TW,2454.TW')
args = parser.parse_args()
symbols = [s.strip().upper() for s in args.symbols.split(',') if s.strip()]
if not symbols or len(symbols)>30 or any(not re.fullmatch(r'[A-Z0-9.^=-]{1,24}',s) for s in symbols):
    parser.error('Provide 1–30 valid comma-separated ticker symbols')
(ROOT/'data').mkdir(exist_ok=True)
def refresh(symbol):
    data=load_data(symbol,'2020-01-01',date.today().isoformat())
    (ROOT/'data'/f'{symbol}.json').write_text(json.dumps(data),encoding='utf-8')
    print(symbol,len(data['prices']),'rows',flush=True)
with ThreadPoolExecutor(max_workers=3) as pool:
    list(pool.map(refresh,symbols))
print('Static datasets refreshed')
