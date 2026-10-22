"""TWSE date-addressable adapters. Access is distinct from public reuse rights."""
from .common import fetch_json,number

def institutions(day,raw_dir=None):
    data,meta=fetch_json('https://www.twse.com.tw/fund/T86',{'response':'json','date':day.replace('-',''),'selectType':'ALLBUT0999'},raw_dir)
    if data.get('stat')!='OK':raise ValueError('TWSE T86 unavailable')
    fields=data['fields'];required=['外陸資買賣超股數(不含外資自營商)','投信買賣超股數']
    if any(f not in fields for f in required):raise ValueError('TWSE T86 schema changed')
    return [{'symbol':r[0]+'.TW','date':day,'foreign_net_shares':number(r[fields.index(required[0])]),'trust_net_shares':number(r[fields.index(required[1])]),'source_unit':'shares',**meta} for r in data['data']]

def margin(day,raw_dir=None):
    data,meta=fetch_json('https://www.twse.com.tw/exchangeReport/MI_MARGN',{'response':'json','date':day.replace('-',''),'selectType':'ALL'},raw_dir)
    tables=[t for t in data.get('tables',[]) if t.get('fields',[])[:2]==['代號','名稱']]
    if len(tables)!=1:raise ValueError('TWSE margin schema changed or unavailable')
    return [{'symbol':r[0]+'.TW','date':day,'margin_balance_shares':number(r[6])*1000,'short_balance_shares':number(r[12])*1000,'source_unit':'lots(1000 shares)',**meta} for r in tables[0]['data']]
