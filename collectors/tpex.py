"""TPEx latest-day adapter; never masquerades as a history API."""
from .common import fetch_json,number

def latest(dataset,raw_dir=None):
    allowed={'tpex_3insti_daily_trading','tpex_mainboard_margin_balance','tpex_mainboard_daily_close_quotes'}
    if dataset not in allowed:raise ValueError('Unsupported TPEx dataset')
    return fetch_json('https://www.tpex.org.tw/openapi/v1/'+dataset,raw_dir=raw_dir)

def normalize_latest(institutional,margin):
    """Explicit current OpenAPI fields; institutional shares, margin lots."""
    foreign='Foreign Investors include Mainland Area Investors (Foreign Dealers excluded)-Difference'
    trust='SecuritiesInvestmentTrustCompanies-Difference'
    credit={r['SecuritiesCompanyCode']:r for r in margin};out=[]
    for r in institutional:
        if foreign not in r or trust not in r:raise ValueError('TPEx institution schema changed')
        m=credit.get(r['SecuritiesCompanyCode']);day=r['Date']
        date=f'{int(day[:3])+1911}-{day[3:5]}-{day[5:7]}'
        out.append({'symbol':r['SecuritiesCompanyCode']+'.TWO','date':date,'foreign_net_shares':number(r[foreign]),'trust_net_shares':number(r[trust]),'margin_balance_shares':number(m['MarginPurchaseBalance'])*1000 if m else None})
    return out
