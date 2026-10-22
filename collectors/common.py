import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
import requests

def fetch_json(url, params=None, raw_dir=None, attempts=3):
    for attempt in range(attempts):
        try:
            r=requests.get(url,params=params,timeout=30,headers={'User-Agent':'VIX-Atlas-Research/1.3'})
            r.raise_for_status();data=r.json()
            if isinstance(data,dict) and 'status' in data and str(data['status'])!='200':raise ValueError(data.get('msg','Provider error'))
            digest=hashlib.sha256(r.content).hexdigest();now=datetime.now(timezone.utc).isoformat()
            meta={'source_url':r.url,'raw_hash':digest,'first_seen_at':now,'fetched_at':now,'published_at':None,'available_from':now,'availability_basis':'observed','revision_id':digest}
            if raw_dir:
                root=Path(raw_dir);root.mkdir(parents=True,exist_ok=True);target=root/f'{digest}.json'
                if not target.exists():target.write_text(json.dumps({'metadata':meta,'data':data},ensure_ascii=False),encoding='utf-8')
                else:
                    old=json.loads(target.read_text())['metadata'];meta['first_seen_at']=old['first_seen_at'];meta['available_from']=old['available_from']
            return data,meta
        except (requests.RequestException,ValueError):
            if attempt==attempts-1:raise
            time.sleep(1.5*(attempt+1))

def number(v):
    if v is None or str(v).strip() in ('','--','---','N/A'):return None
    return float(str(v).replace(',','').replace(' ',''))
