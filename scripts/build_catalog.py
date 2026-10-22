"""Official symbol directories + explicit curated snapshot watchlists."""
import csv
from datetime import datetime,timezone
import io
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collectors.common import fetch_json
import requests
ROOT=Path(__file__).resolve().parents[1]
US_WATCH='SPY QQQ AAPL NVDA MSFT TSLA AMD AMZN GOOGL META AVGO BRK-B JPM V MA UNH XOM COST HD PG JNJ WMT ABBV NFLX BAC CRM ORCL KO PEP CVX MRK TMO CSCO ACN MCD ABT LIN DIS IBM GE CAT GS AXP RTX NOW QCOM TXN INTU AMGN ISRG UBER BKNG PFE HON VZ T CMCSA DHR LOW SBUX LMT DE NKE PANW MU AMAT LRCX KLAC ADI INTC PLTR SNOW CRWD SHOP COIN ARM TSM ASML NVO BABA PDD JD BIDU NIO RIVN SOFI PYPL WFC C MS SCHW BLK F GM FDX UPS BA DAL IWM DIA'.split()
TW_WATCH=('2330.TW 2317.TW 2454.TW 2308.TW 2382.TW 2881.TW 2882.TW 2891.TW 2303.TW 3711.TW 2412.TW 2886.TW 2884.TW 2885.TW 2880.TW 2892.TW 2883.TW 2890.TW 2887.TW 5880.TW 1301.TW 1303.TW 1326.TW 2002.TW 1101.TW 1102.TW 1216.TW 2207.TW 2327.TW 2379.TW 3034.TW 3045.TW 4904.TW 6505.TW 2912.TW 2603.TW 2609.TW 2615.TW 2618.TW 2610.TW 2801.TW 5871.TW 5876.TW 1605.TW 2408.TW 2409.TW 3481.TW 2357.TW 2356.TW 2353.TW 2324.TW 3231.TW 2345.TW 2301.TW 2313.TW 2312.TW 2347.TW 2376.TW 2377.TW 2395.TW 3008.TW 3017.TW 3037.TW 3044.TW 3443.TW 3533.TW 3653.TW 3661.TW 3702.TW 4938.TW 4958.TW 5269.TW 5347.TWO 5483.TWO 6488.TWO 8069.TWO 8299.TWO 5274.TWO 3105.TWO 6147.TWO 3529.TWO 3211.TWO 3264.TWO 6182.TWO 6274.TWO 8046.TW 9910.TW 9914.TW 9921.TW 9945.TW 1476.TW 1477.TW 1590.TW 2105.TW 2201.TW 2305.TW 2474.TW 3023.TW 6415.TW 6669.TW').split()

def build():
    entries={}
    rows,_=fetch_json('https://openapi.twse.com.tw/v1/opendata/t187ap03_L')
    for r in rows:
        symbol=r['公司代號']+'.TW';entries[symbol]={'symbol':symbol,'provider_symbol':symbol,'name_zh':r['公司簡稱'].strip(),'name_en':r.get('英文簡稱','').strip(),'market':'TW','exchange':'TWSE','currency':'TWD','industry':r.get('產業別'),'listed_from':r.get('上市日期'),'instrument_type':'stock','listed_status':'current'}
    rows,_=fetch_json('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O')
    for r in rows:
        symbol=r['SecuritiesCompanyCode']+'.TWO';entries[symbol]={'symbol':symbol,'provider_symbol':symbol,'name_zh':r['CompanyAbbreviation'].strip(),'name_en':r.get('Symbol','').strip(),'market':'TW','exchange':'TPEx','currency':'TWD','industry':r.get('SecuritiesIndustryCode'),'listed_from':r.get('DateOfListing'),'instrument_type':'stock','listed_status':'current'}
    for filename in ['nasdaqlisted.txt','otherlisted.txt']:
        r=requests.get('https://www.nasdaqtrader.com/dynamic/SymDir/'+filename,timeout=30);r.raise_for_status()
        for row in csv.DictReader(io.StringIO(r.text),delimiter='|'):
            ticker=row.get('Symbol') or row.get('ACT Symbol')
            if not ticker or row.get('Test Issue')!='N':continue
            provider=ticker.replace('.','-');entries[provider]={'symbol':ticker,'provider_symbol':provider,'name_en':row.get('Security Name',''),'name_zh':'','market':'US','exchange':'NASDAQ' if filename.startswith('nasdaq') else row.get('Exchange','US'),'currency':'USD','instrument_type':'ETF' if row.get('ETF')=='Y' else 'stock/other','listed_status':'current'}
    paths={p.stem:str(p.relative_to(ROOT)) for p in (ROOT/'data/stocks').glob('*.json')}
    for p in (ROOT/'data').glob('*.json'):
        if p.stem not in ('vix','symbol_catalog','manifest','chip_report','source_checks','watchlist'):paths.setdefault(p.stem,str(p.relative_to(ROOT)))
    for symbol in set(US_WATCH+TW_WATCH):
        entries.setdefault(symbol,{'symbol':symbol,'provider_symbol':symbol,'name_en':symbol,'name_zh':'','market':'TW' if '.' in symbol and symbol.endswith(('.TW','.TWO')) else 'US','exchange':'watchlist','currency':'TWD' if symbol.endswith(('.TW','.TWO')) else 'USD','instrument_type':'watchlist','listed_status':'unverified'})
    for key,e in entries.items():
        path=paths.get(key);e['has_snapshot']=bool(path);e['snapshot_path']=path
        if path:
            data=json.loads((ROOT/path).read_text());e['last_price_date']=data['prices'][-1]['date'];e['updated_at']=data.get('fetchedAt')
    payload={'schema_version':1,'updated_at':datetime.now(timezone.utc).isoformat(),'universe_basis':'current directories, not a point-in-time historical universe','watchlist_basis':'manually curated; not a market ranking','sources':['TWSE t187ap03_L','TPEx mopsfin_t187ap03_O','Nasdaq Trader Symbol Directory'],'symbols':sorted(entries.values(),key=lambda e:e['provider_symbol'])}
    (ROOT/'data/symbol_catalog.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    (ROOT/'data/watchlist.json').write_text(json.dumps({'TW':TW_WATCH,'US':US_WATCH},ensure_ascii=False),encoding='utf-8')
    print('Catalog:',len(entries),'symbols;',len(TW_WATCH),'TW /',len(US_WATCH),'US watchlist')
    return payload

if __name__=='__main__':build()
