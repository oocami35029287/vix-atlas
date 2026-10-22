/* Browser-to-provider data access. Source observations never enter Git/Pages/CI. */
const AtlasData=(()=>{
 const C=typeof module!=='undefined'?require('./research_core.js'):ResearchCore;
 const datasets=new Set(['TaiwanStockPrice','USStockPrice','TaiwanStockInfo','USStockInfo','TaiwanStockMonthRevenue','TaiwanStockFinancialStatements','TaiwanStockInstitutionalInvestorsBuySell','TaiwanStockMarginPurchaseShortSale']);
 const SCHEMA='1.4',ENDPOINT='https://api.finmindtrade.com/api/v4/data';
 class DataError extends Error{constructor(code,message){super(code+' · '+message);this.code=code;}}
 const fail=(code,msg)=>{throw new DataError(code,msg);};
 const clone=x=>JSON.parse(JSON.stringify(x));
 const stable=x=>JSON.stringify(x,Object.keys(x).sort());
 async function hash(x){const bytes=new TextEncoder().encode(JSON.stringify(x));const result=await globalThis.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(result)].map(v=>v.toString(16).padStart(2,'0')).join('');}
 function request(input){
  const r={schema_version:SCHEMA,permission:'public-personal-research',provider:'FinMind',dataset:input.dataset,symbol:input.symbol??'',start:input.start??'',end:input.end??'',mode:input.mode??'latest',as_of:input.as_of??'',adjustment:'provider-unadjusted',currency:input.currency??''};
  if(!datasets.has(r.dataset))fail('UNSUPPORTED_SYMBOL','不支援此資料集');
  if(r.symbol&&!/^[A-Z0-9.^=-]{1,24}$/.test(r.symbol))fail('UNSUPPORTED_SYMBOL','代號格式無效');
  if(!['latest','historical_asof','proxy'].includes(r.mode))fail('NO_DATA','資料模式無效');
  if(r.mode==='historical_asof'&&(!Number.isFinite(Date.parse(r.as_of))||!/([+-]\d\d:\d\d|Z)$/.test(r.as_of)))fail('HISTORICAL_VERSION_UNAVAILABLE','必須提供含時區的查詢時點');
  if(r.start&&(!C.validDate(r.start)||!C.validDate(r.end)||r.start>r.end||Date.parse(r.end)-Date.parse(r.start)>864e5*365.25*25))fail('NO_DATA','查詢日期須有效，最多 25 年');
  if(!r.symbol&&!r.dataset.endsWith('Info'))fail('UNSUPPORTED_SYMBOL','請提供代號');return r;
 }
 function cacheKey(r){return stable(request(r));}
 class MemoryStore{
  constructor(){this.pointers=new Map();this.revisions=new Map();}
  async pointer(k){return this.pointers.get(k);}
  async resolve(id){return this.revisions.get(id);}
  async save(k,e,expires=Date.parse(e.fetched_at)+e.ttl_ms){if(!this.revisions.has(e.dataset_revision))this.revisions.set(e.dataset_revision,clone(e));this.pointers.set(k,{revision:e.dataset_revision,expires});}
  async find(r){const target={...r,mode:'historical_asof'};return [...this.revisions.values()].filter(e=>e.request.dataset===target.dataset&&e.request.symbol===target.symbol&&e.request.start===target.start&&e.request.end===target.end&&e.request.permission===target.permission&&e.request.adjustment===target.adjustment&&e.request.currency===target.currency&&e.request.mode!=='proxy'&&Date.parse(e.fetched_at)<=Date.parse(r.as_of)).sort((a,b)=>Date.parse(b.fetched_at)-Date.parse(a.fetched_at))[0];}
  async clear(){this.pointers.clear();this.revisions.clear();}
 }
 class BrowserStore{
  constructor(){this.memory=new MemoryStore();this.persistence='session';this.ready=new Promise(resolve=>{if(!globalThis.indexedDB){resolve(null);return;}const q=indexedDB.open('vix-atlas-private-evidence-v1',1);q.onupgradeneeded=()=>{q.result.createObjectStore('pointers');q.result.createObjectStore('revisions');};q.onsuccess=()=>{this.persistence='browser';resolve(q.result);};q.onerror=()=>resolve(null);});}
  async op(store,mode,action){const db=await this.ready;if(!db)return undefined;return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),q=action(tx.objectStore(store));let result;q.onsuccess=()=>result=q.result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);});}
  async pointer(k){return await this.op('pointers','readonly',s=>s.get(k))??this.memory.pointer(k);}
  async resolve(k){return await this.op('revisions','readonly',s=>s.get(k))??this.memory.resolve(k);}
  async save(k,e,expires=Date.parse(e.fetched_at)+e.ttl_ms){const db=await this.ready;if(db){try{const old=await this.op('revisions','readonly',s=>s.get(e.dataset_revision));if(!old)await this.op('revisions','readwrite',s=>s.add(clone(e),e.dataset_revision));await this.op('pointers','readwrite',s=>s.put({revision:e.dataset_revision,expires},k));}catch{this.persistence='session';/* Browser quota or privacy mode: retain this session only. */}}await this.memory.save(k,e,expires);}
  async find(r){const all=await this.op('revisions','readonly',s=>s.getAll());if(!all)return this.memory.find(r);const temp=new MemoryStore();for(const e of [...all,...this.memory.revisions.values()])temp.revisions.set(e.dataset_revision,e);return temp.find(r);}
  async clear(){await this.op('pointers','readwrite',s=>s.clear());await this.op('revisions','readwrite',s=>s.clear());await this.memory.clear();}
 }
 function createClient({fetcher=globalThis.fetch?.bind(globalThis),store=new BrowserStore(),now=()=>Date.now(),digest=hash}={}){
  const pending=new Map(),calls=[];let failures=0,openUntil=0;
  async function get(input,{refresh=false}={}){
   const r=request(input),key=cacheKey(r);
   if(r.mode==='historical_asof'){
    const e=await store.find(r);if(!e)fail('HISTORICAL_VERSION_UNAVAILABLE','此時點沒有已保存的版本；不會改用最新資料');
    return clone({...e,mode:r.mode,requested_as_of:r.as_of,cache_state:'immutable-evidence',evidence_level:'observed_snapshot'});
   }
   const pointer=await store.pointer(key);if(!refresh&&pointer?.expires>now()){const e=await store.resolve(pointer.revision);if(e)return clone({...e,cache_state:'fresh'});}
   if(pending.has(key))return clone(await pending.get(key));
   const task=(async()=>{
    if(now()<openUntil)fail('UPSTREAM_UNAVAILABLE','資料來源暫時停止回應，請稍後重試');
    while(calls.length&&calls[0]<now()-60000)calls.shift();if(calls.length>=24)fail('RATE_LIMITED','每分鐘最多 24 次資料請求；請稍候');calls.push(now());
    const url=new URL(ENDPOINT);url.searchParams.set('dataset',r.dataset);if(r.symbol)url.searchParams.set('data_id',r.symbol.replace(/\.TW(O)?$/,''));if(r.start){url.searchParams.set('start_date',r.start);url.searchParams.set('end_date',r.end);}
    let response,j;
    try{response=await fetcher(url.href,{signal:AbortSignal.timeout(45000),credentials:'omit'});if(!response.ok){if(response.status===429)fail('RATE_LIMITED','來源流量限制');if([401,402,403].includes(response.status))fail('AUTH_REQUIRED','來源要求授權，請使用已取得使用權的本機資料包');fail('UPSTREAM_UNAVAILABLE','來源 HTTP '+response.status);}j=await response.json();}
    catch(e){if(e instanceof DataError)throw e;fail('UPSTREAM_UNAVAILABLE','無法連接來源，請稍後再試或匯入自己的資料');}
    if(j.status!==200){if([401,402,403].includes(j.status))fail('AUTH_REQUIRED','來源要求授權');if(j.status===429)fail('RATE_LIMITED','來源流量限制');fail('UPSTREAM_UNAVAILABLE','來源未完成請求');}
    if(!Array.isArray(j.data)||!j.data.length)fail('NO_DATA','此代號或期間沒有資料');
    if(j.data.length>250000||JSON.stringify(j.data).length>15e6)fail('PARTIAL','回應超出單次研究預算');
    const fetched_at=new Date(now()).toISOString(),revision=await digest({request:r,rows:j.data});const existing=await store.resolve(revision);
    const dated=j.data.map(x=>x.date).filter(C.validDate).sort();if(r.dataset.endsWith('Price')&&dated.length&&r.end&&Date.parse(r.end)-Date.parse(dated.at(-1))>14*864e5)fail('STALE','來源最後日期距請求結束超過 14 日；本次研究不使用此過舊資料');const e={schema_version:SCHEMA,request_id:globalThis.crypto?.randomUUID?.()??String(now()),request:r,mode:r.mode,dataset:r.dataset,dataset_revision:revision,source:'FinMind; original providers TWSE / TPEx / US market sources',source_url:ENDPOINT,source_asof:dated.at(-1)??null,fetched_at,first_seen_at:existing?.first_seen_at??fetched_at,calendar_id:r.symbol.endsWith('.TW')||r.symbol.endsWith('.TWO')||r.dataset.startsWith('Taiwan')?'TW-market-proxy':'US-market-proxy',exchange_timezone:r.dataset.startsWith('Taiwan')?'Asia/Taipei':'America/New_York',adjustment:r.adjustment,currency:r.currency,evidence_level:r.mode==='proxy'?'proxy':'observed_snapshot',license_scope:'personal research directly from source; no redistribution or mirror',cache_state:'network',coverage:{requested_start:r.start||null,requested_end:r.end||null,start:dated[0]??null,end:dated.at(-1)??null,warmup:'included in requested range; strategy validates complete sessions',missing:null,source_calendar_complete:false,corporate_actions:'unverified',historical_vintages:false},ttl_ms:r.dataset.endsWith('Info')?86400000:r.dataset.includes('Revenue')||r.dataset.includes('Financial')?3600000:900000,data:j.data};
    // Same request + unchanged payload resolves to the original immutable observation.
    const resolved=existing??e;await store.save(key,resolved,now()+e.ttl_ms);failures=0;return clone({...resolved,storage_scope:store.persistence??'session'});
   })().catch(e=>{if(e.code==='UPSTREAM_UNAVAILABLE'&&++failures>=3)openUntil=now()+60000;throw e;}).finally(()=>pending.delete(key));
   pending.set(key,task);return clone(await task);
  }
  return {get,store};
 }
 function calendarDate(now,zone){return new Intl.DateTimeFormat('sv-SE',{timeZone:zone}).format(now);}
 function priceRows(e,symbol,now=new Date()){
  const tw=e.dataset.startsWith('Taiwan'),today=calendarDate(now,tw?'Asia/Taipei':'America/New_York');
  const all=e.data.map(r=>tw?{date:r.date,open:r.open,close:r.close,high:r.max,low:r.min,volume_shares:r.Trading_Volume,value_twd:r.Trading_money}:{date:r.date,open:r.Open,close:r.Close,high:r.High,low:r.Low,volume_shares:r.Volume}).filter(r=>C.validDate(r.date)&&r.open>0&&r.close>0).sort((a,b)=>a.date.localeCompare(b.date));
  const seen=new Set();for(const r of all){if(seen.has(r.date))fail('PARTIAL','來源日線日期重複');seen.add(r.date);}
  return all.filter(r=>r.date<today&&(!e.request?.start||r.date>=e.request.start)&&(!e.request?.end||r.date<=e.request.end)).map(r=>({...r,bar_state:'provisional',finality_evidence:'prior exchange date; provider completion unverified',availability_basis:'proxy',revision_id:e.dataset_revision,available_from:e.first_seen_at,source_timezone:tw?'Asia/Taipei':'America/New_York'}));
 }
 function revenueRows(e){
  return e.data.map(r=>{const month=String(r.revenue_year)+'-'+String(r.revenue_month).padStart(2,'0'),mi=+r.revenue_year*12+(+r.revenue_month-1),report=new Date(Date.UTC(Math.floor((mi+1)/12),(mi+1)%12,10)).toISOString().slice(0,10),created=C.validDate(r.create_time)&&r.create_time>'2026-04-21'?r.create_time:report;
   return {month,revenue:r.revenue,comparable:true,scope:'consolidated-provider-proxy',currency:'TWD',unit:'TWD',available_from:created+'T23:59:59+08:00',availability_basis:'proxy',timestamp_precision:'date',source_timezone:'Asia/Taipei',date_only_conservative:true,first_seen_at:e.first_seen_at,revision_id:e.dataset_revision,event_origin:'historical_backfill',availability_note:'FinMind create_time is ingestion date; older rows assume reporting-month day 10. Neither proves official publication.'};
  });
 }
 function financialRows(e){
  const periods=new Map();for(const r of e.data){if(!['Revenue','OperatingIncome'].includes(r.type)||!C.validDate(r.date))continue;const y=+r.date.slice(0,4),q=Math.ceil(+r.date.slice(5,7)/3),key=y+'-Q'+q;if(!periods.has(key))periods.set(key,{period:key,revenue:null,operating_income:null,scope:'consolidated-provider-proxy',currency:'TWD',unit:'TWD',comparable:true,value_kind:'single',available_from:(q===4?(y+1)+'-04-01':y+'-'+({1:'05-16',2:'08-15',3:'11-15'}[q]))+'T23:59:59+08:00',availability_basis:'proxy',timestamp_precision:'date',source_timezone:'Asia/Taipei',date_only_conservative:true,first_seen_at:e.first_seen_at,revision_id:e.dataset_revision,availability_note:'Single-quarter provider convention and conservative reporting-date assumptions; no original vintage / publication evidence.'});periods.get(key)[r.type==='Revenue'?'revenue':'operating_income']=r.value;}
  return [...periods.values()].sort((a,b)=>a.period.localeCompare(b.period));
 }
 function joinChips(prices,institutions,margin){
  const flows=new Map(),credit=new Map((margin?.data??[]).map(r=>[r.date,r]));for(const r of institutions?.data??[]){const k=r.name==='Foreign_Investor'?'foreign_net_shares':r.name==='Investment_Trust'?'trust_net_shares':null;if(k){if(!flows.has(r.date))flows.set(r.date,{});flows.get(r.date)[k]=r.buy-r.sell;}}
  return prices.map(r=>({...r,...flows.get(r.date),margin_balance_shares:C.finite(credit.get(r.date)?.MarginPurchaseTodayBalance)?credit.get(r.date).MarginPurchaseTodayBalance*1000:null,availability_basis:'proxy'}));
 }
 return {DataError,MemoryStore,BrowserStore,request,cacheKey,hash,createClient,calendarDate,priceRows,revenueRows,financialRows,joinChips};
})();
if(typeof module!=='undefined')module.exports=AtlasData;
