"""Personal research only. Raw data must never be published."""
from .common import fetch_json
import json
from pathlib import Path
from urllib.parse import urlencode

def history(dataset,symbol,start,raw_dir,use_cache=False):
    if dataset not in {'TaiwanStockPrice','TaiwanStockInstitutionalInvestorsBuySell','TaiwanStockMarginPurchaseShortSale'}:raise ValueError('Unsupported dataset')
    params={'dataset':dataset,'data_id':symbol.split('.')[0],'start_date':start}
    if use_cache:
        url='https://api.finmindtrade.com/api/v4/data?'+urlencode(params)
        for file in Path(raw_dir).glob('*.json'):
            prior=json.loads(file.read_text())
            if prior['metadata']['source_url']==url:return prior['data'].get('data',[]),prior['metadata']
    data,meta=fetch_json('https://api.finmindtrade.com/api/v4/data',params,raw_dir)
    return data.get('data',[]),meta
