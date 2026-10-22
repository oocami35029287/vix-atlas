"""Private research inputs, plus source/quality checks safe to publish."""
import argparse
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import sys
import time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collectors.finmind_fallback import history
from collectors import twse,tpex
from data_pipeline.normalize import normalize_finmind
from data_pipeline.quality import validate_prices
ROOT=Path(__file__).resolve().parents[1]
SYMBOLS=['2330.TW','2317.TW','2454.TW','5347.TWO','5483.TWO','6488.TWO']

def build(start='2020-01-01',resume=False):
    private=ROOT/'.private';private.mkdir(exist_ok=True)
    catalog=json.loads((ROOT/'data/symbol_catalog.json').read_text());names={r['provider_symbol']:r for r in catalog['symbols']}
    stocks=[];checks=[]
    for symbol in SYMBOLS:
        datasets=[];metas=[]
        for ds in ['TaiwanStockPrice','TaiwanStockInstitutionalInvestorsBuySell','TaiwanStockMarginPurchaseShortSale']:
            rows,meta=history(ds,symbol,start,private/'raw',use_cache=resume);datasets.append(rows);metas.append(meta);time.sleep(.3)
        metadata={**metas[0],'available_from':max(m['available_from'] for m in metas),'revision_id':hashlib.sha256(''.join(m['raw_hash'] for m in metas).encode()).hexdigest()}
        normalized=normalize_finmind(*datasets,metadata)
        rows=[r for r in normalized if all(isinstance(r.get(k),(int,float)) and r[k]>0 for k in ['open','close','volume_shares','value_twd'])]
        invalid_days=[r['date'] for r in normalized if r not in rows]
        validate_prices(rows)
        stocks.append({'symbol':symbol,'name':names.get(symbol,{}).get('name_zh',symbol),'industry':names.get(symbol,{}).get('industry','unknown'),'prices':rows})
        checks.append({'symbol':symbol,'price_rows':len(rows),'invalid_or_zero_price_days':invalid_days,'institutional_dates':len(set(r['date'] for r in datasets[1])),'margin_dates':len(datasets[2]),'missing_chip_dates':sum(r.get('foreign_net_shares') is None or r.get('trust_net_shares') is None or r.get('margin_balance_shares') is None for r in rows),'start':rows[0]['date'],'end':rows[-1]['date']})
        print(symbol,len(rows),'private rows',flush=True)
    universe={'schema_version':'1.3','source':'FinMind; original providers TWSE / TPEx','evidence_complete':False,'corporate_actions_complete':False,'universe_basis':'six currently listed validation stocks; survivorship bias unresolved','calendar':sorted(set(r['date'] for s in stocks for r in s['prices'])),'symbols':stocks,'availability_basis':'proxy'}
    target=private/'chip_universe.json';target.write_text(json.dumps(universe,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    comparison=[];day=min(s['prices'][-1]['date'] for s in stocks)
    try:
        official_i={r['symbol']:r for r in twse.institutions(day,private/'raw')};official_m={r['symbol']:r for r in twse.margin(day,private/'raw')}
        for stock in stocks[:3]:
            row=next(r for r in stock['prices'] if r['date']==day);symbol=stock['symbol']
            comparison.append({'symbol':symbol,'date':day,'institutional_shares_match':all(row.get(k)==official_i.get(symbol,{}).get(k) for k in ['foreign_net_shares','trust_net_shares']),'margin_lots_x1000_match':row.get('margin_balance_shares')==official_m.get(symbol,{}).get('margin_balance_shares')})
    except Exception as e:comparison.append({'status':'unverified','reason':str(e)[:180]})
    tpex_status=[];tpex_data={}
    for ds in ['tpex_3insti_daily_trading','tpex_mainboard_margin_balance','tpex_mainboard_daily_close_quotes']:
        try:
            rows,meta=tpex.latest(ds,private/'raw');tpex_data[ds]=rows;tpex_status.append({'dataset':ds,'rows':len(rows),'fields':list(rows[0]) if rows else [],'latest_only':True})
        except Exception as e:tpex_status.append({'dataset':ds,'error':str(e)[:180]})
    try:
        official={r['symbol']:r for r in tpex.normalize_latest(tpex_data['tpex_3insti_daily_trading'],tpex_data['tpex_mainboard_margin_balance'])}
        for stock in stocks[3:]:
            other=official[stock['symbol']];row=next(r for r in stock['prices'] if r['date']==other['date'])
            comparison.append({'symbol':stock['symbol'],'date':row['date'],'institutional_shares_match':all(row.get(k)==other.get(k) for k in ['foreign_net_shares','trust_net_shares']),'margin_lots_x1000_match':row.get('margin_balance_shares')==other.get('margin_balance_shares')})
    except Exception as e:comparison.append({'market':'TPEx','status':'unverified','reason':str(e)[:180]})
    report={'checked_at':datetime.now(timezone.utc).isoformat(),'checks':checks,'official_unit_comparison':comparison,'tpex_latest_schema':tpex_status,'G0':False,'issues':['No historical first-publication vintages','Current-survivor six-stock convenience sample','Opening limits / tradability and corporate-action history incomplete','Multi-day official revision reconciliation is not yet certified'],'public_raw_data':False,'raw_location':'private local storage; never deployed'}
    (ROOT/'data/source_checks.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print('Private universe ready; public quality report only',flush=True)
    return universe

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--start',default='2020-01-01');p.add_argument('--resume',action='store_true');args=p.parse_args();build(args.start,args.resume)
