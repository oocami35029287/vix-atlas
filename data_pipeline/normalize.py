"""Margin lots -> shares, verified against official data. Missing != zero."""
from collections import defaultdict

def normalize_finmind(prices,institutional,margin,metadata):
    chips=defaultdict(dict)
    for r in institutional:
        if r['name'] in ('Foreign_Investor','Investment_Trust'):
            key='foreign_net_shares' if r['name']=='Foreign_Investor' else 'trust_net_shares'
            chips[r['date']][key]=r['buy']-r['sell']
    credit={r['date']:r for r in margin};out=[]
    for r in prices:
        m=credit.get(r['date'],{})
        out.append({'date':r['date'],'open':r['open'],'high':r['max'],'low':r['min'],'close':r['close'],
                    'volume_shares':r['Trading_Volume'],'value_twd':r['Trading_money'],**chips.get(r['date'],{}),
                    'margin_balance_shares':m['MarginPurchaseTodayBalance']*1000 if m.get('MarginPurchaseTodayBalance') is not None else None,
                    'short_balance_shares':m['ShortSaleTodayBalance']*1000 if m.get('ShortSaleTodayBalance') is not None else None,
                    'source':'FinMind (TWSE/TPEx)','source_unit':{'price_volume':'shares','credit':'lots; multiplied by 1000'},
                    **metadata,'availability_basis':'proxy','trading_status':'unknown','tradable':None,
                    'quality_flags':['NO_HISTORICAL_VINTAGE','NO_OPENING_LIMIT_EVIDENCE','CORPORATE_ACTIONS_UNVERIFIED']})
    return out
