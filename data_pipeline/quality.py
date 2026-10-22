import math
from datetime import date

def validate_prices(rows):
    previous=''
    for r in rows:
        if date.fromisoformat(r['date']).isoformat()!=r['date'] or r['date']<=previous:raise ValueError('Duplicate or unordered dates')
        if any(not isinstance(r.get(k),(int,float)) or not math.isfinite(r[k]) or r[k]<=0 for k in ('open','close','volume_shares','value_twd')):raise ValueError('Invalid price, volume or value')
        previous=r['date']
    if len(rows)<120:raise ValueError('At least 120 price rows required')
