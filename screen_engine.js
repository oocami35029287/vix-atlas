/* Versioned four-stage snapshot research; never backfills today's selections. */
const AutoScreen=(()=>{
 const C=typeof module!=='undefined'?require('./research_core.js'):ResearchCore;
 const R=typeof module!=='undefined'?require('./rev_mom_engine.js'):RevMomEngine;
 const VERSION='REV-MOM-AUTO-v0.1';
 // Preregistered engineering hypotheses. These values are not fitted to returns.
 const QUALITY=Object.freeze({id:'Q-positive-4Q-v1',profitable_quarters:4,ttm_cfo_min:0,max_liabilities_to_assets:1});
 const WATCHLIST=Object.freeze(['2330.TW','2317.TW','2454.TW','2308.TW','2382.TW','2303.TW','2379.TW','3711.TW','3231.TW','2357.TW','2327.TW','2345.TW','3034.TW','4938.TW','2376.TW','3661.TW','5347.TWO','6488.TWO','3529.TWO','3105.TWO']);
 function pool(catalog,{source='watchlist',size=8,market='TW',seed='atlas-v1'}={}){
  if(market!=='TW')throw Error('US_AUTO_SOURCE_UNAVAILABLE · 美股季度／公告及機構資料尚未建立獨立契約');
  if(!Number.isInteger(size)||size<6||size>30)throw Error('候選池須為 6–30 檔，與最多五格分開');
  let list=catalog.filter(s=>s.market==='TW'&&/^\d{4}\.TW(O)?$/.test(s.provider_symbol)&&!s.provider_symbol.startsWith('0')&&!/金融|保險|Financial|Bank/i.test(s.industry??''));
  if(source==='watchlist')list=WATCHLIST.map(symbol=>list.find(s=>s.provider_symbol===symbol)).filter(Boolean);
  else{
   if(!['twse','tpex','all'].includes(source))throw Error('候選市場無效');if(source!=='all')list=list.filter(s=>s.exchange.toLowerCase()===source);
   const score=s=>{let h=2166136261;for(const ch of seed+':'+s.provider_symbol){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};list.sort((a,b)=>score(a)-score(b)||a.provider_symbol.localeCompare(b.provider_symbol));
  }
  const unique=[...new Map(list.map(s=>[s.provider_symbol,s])).values()];return {id:source==='watchlist'?'manual-observation-v1':'catalog-hash-v1',source,seed,size:Math.min(size,unique.length),catalog_count:unique.length,symbols:unique.slice(0,size).map(s=>s.provider_symbol),basis:'current-survivor bounded observation pool; not whole-market or historical point-in-time'};
 }
 const qi=p=>{const m=/^(\d{4})-Q([1-4])$/.exec(p);return m?+m[1]*4+(+m[2]-1):NaN;};
 function selected(records,at,p){const by=new Map();for(const r of records??[]){if(!by.has(r.period))by.set(r.period,{...r,versions:[]});by.get(r.period).versions.push(...(r.versions??[r]).map(v=>({...r,...v,versions:undefined})));}return [...by.values()].map(r=>R.select(r,at,p)).filter(Boolean).sort((a,b)=>qi(a.period)-qi(b.period));}
 function flowQuarters(records,field,at,p){
  const rows=selected(records,at,p),map=new Map(rows.map(r=>[r.period,r]));
  return rows.map(r=>{let value=r[field];const index=qi(r.period);if(!C.finite(index)||!C.finite(value)||r.comparable!==true||!r.scope||!r.currency||!r.unit)return null;
   if(r.value_kind==='cumulative'&&index%4){const prev=map.get(r.period.slice(0,5)+'Q'+(index%4));if(!prev||prev.value_kind!=='cumulative'||!C.finite(prev[field])||['scope','currency','unit'].some(k=>r[k]!==prev[k])||prev.comparable!==true)return null;value-=prev[field];}
   else if(!['cumulative','single'].includes(r.value_kind))return null;
   return {...r,qi:index,value};
  }).filter(Boolean);
 }
 function quality(stock,at,p){
  const profits=flowQuarters(stock.financials,'net_income',at,p).slice(-4),cash=flowQuarters(stock.cash_flows,'operating_cash_flow',at,p),balance=selected(stock.balance_sheets,at,p).at(-1);
  const fail=(reason,complete=false,details={})=>({pass:false,complete,reason,...details});
  if(profits.length!==4||profits.some((r,i)=>i&&r.qi!==profits[i-1].qi+1))return fail('QUALITY_PROFIT_HISTORY_MISSING');
  const qs=profits.map(r=>cash.find(c=>c.period===r.period));if(qs.some(x=>!x)||!balance||balance.period!==profits.at(-1).period)return fail('QUALITY_STATEMENT_ALIGNMENT_MISSING');
  const rows=[...profits,...qs,balance];if(['scope','currency','unit'].some(k=>rows.some(r=>r[k]!==profits[0][k])))return fail('QUALITY_SCOPE_MISMATCH');
  const {assets,liabilities,equity}=balance;if(![assets,liabilities,equity].every(C.finite)||assets<=0||liabilities<0)return fail('QUALITY_BALANCE_MISSING');
  const cfo=qs.reduce((s,r)=>s+r.value,0),net=profits.reduce((s,r)=>s+r.value,0),details={periods:profits.map(r=>r.period),profit_quarters:profits.filter(r=>r.value>0).length,ttm_cfo:cfo,ttm_net_income:net,liabilities_to_assets:liabilities/assets,cash_conversion:net>0?cfo/net:null,revisions:rows.map(r=>r.revision_id)};
  if(profits.some(r=>r.value<=0))return fail('QUALITY_LOSS_QUARTER',true,details);if(cfo<=0)return fail('QUALITY_NONPOSITIVE_CFO',true,details);if(equity<=0||liabilities>=assets)return fail('QUALITY_BALANCE_RISK',true,details);
  return {pass:true,complete:true,reason:'QUALITY_PASS',...details};
 }
 function screen(u,{as_of,availability='proxy',institution=true,slots=5,ranking='weighted',min_adv_value=30000000,locked=[],held_symbols=[],signal_date=null}={}){
  if(!Number.isFinite(Date.parse(as_of))||!/([+-]\d\d:\d\d|Z)$/.test(as_of))throw Error('需提供含時區的凍結截止時點');
  if(!Array.isArray(u.symbols)||u.symbols.length>30)throw Error('自動觀察池須為 1–30 檔');if(!u.symbols.length){if(!u.collection_errors?.length)throw Error('候選池不可為空');return {version:VERSION,as_of,signal_date:null,availability,counts:{scanned:u.expected_symbols?.length??u.collection_errors.length,valid_data:0,quality:0,revenue:0,technical:0,institution:0,recommendable:0,selected:0},status:'PARTIAL_NO_NEW_RANKING',coverage_complete:false,collection_errors:u.collection_errors,candidate_pool:u.manifest?.candidate_pool??[],ranked:[],recommendations:[],unselected:[],audit:[],no_ifp_same_pool:[],not_historical_portfolio:true,gates:{G0:false,G1:false,G2:false,G3:false}};}
  if(u.market&&u.market!=='TW')throw Error('US_AUTO_SOURCE_UNAVAILABLE');if(!Number.isInteger(slots)||slots<1||slots>5||!C.finite(min_adv_value)||min_adv_value<0)throw Error('推薦設定無效');
  const localDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date(as_of)),day=signal_date??u.calendar.filter(d=>d<=localDate).at(-1);
  if(!day||day>localDate||Date.parse(as_of)-Date.parse(day+'T13:30:00+08:00')<0)throw Error('本次需有截止前已完成的市場收盤');
  if(Date.parse(as_of)-Date.parse(day+'T13:30:00+08:00')>14*864e5)throw Error('STALE · 不能把過舊訊號當作本次推薦');
  const cal=u.calendar.filter(d=>d<=day),at=as_of,p=R.config({availability,institution,ranking,exit:'F20',holding:20}),stocks=u.symbols.map(s=>({...s,prices:s.prices.filter(r=>r.date<=day)})),base={...u,calendar:cal,symbols:stocks,benchmark:u.benchmark?{...u.benchmark,prices:u.benchmark.prices.filter(r=>r.date<=day)}:null};
  if(availability==='strict'){for(const s of [...base.symbols,...(base.benchmark?[base.benchmark]:[])])s.prices=s.prices.map(r=>R.select(r,as_of,p)).filter(Boolean);}
  const g=R.createSignals(base,p),audit=[],eligible=[],i=cal.length-1,counts={scanned:u.expected_symbols?.length??stocks.length,valid_data:0,quality:0,revenue:0,technical:0,institution:0,recommendable:0,selected:0};
  for(let j=0;j<stocks.length;j++){
   const s=stocks[j],active=g.eventLog.filter(e=>e.symbol===s.symbol&&e.d0&&e.d0<=day&&cal.indexOf(e.d0)+4>=i).sort((a,b)=>b.month.localeCompare(a.month))[0],q=quality(s,active?.frozen_at??as_of,p),r={symbol:s.symbol,name:s.name||s.symbol,industry:s.industry??'unknown',quality:q,stages:{quality:false,revenue:false,technical:false,institution:false},reasons:[],data_asof:day};
   const x=g.indicators[j]?.[i],recent=cal.slice(-21).map(d=>s.prices.find(r=>r.date===d));
   if(s.financial_industry||/金融|保險|Financial|Insurance|Bank/i.test(s.industry??'')){r.reasons.push('EXCLUDED_FINANCIAL');audit.push(r);continue;}
   if(!q.complete||recent.length!==21||recent.some(row=>!R.known(row,as_of,p))||!x||x.split||!C.finite(x.rs20)||!C.finite(x.advVolume)){r.reasons.push(q.complete?'PRICE_OR_BENCHMARK_INCOMPLETE':q.reason);audit.push(r);continue;}
   counts.valid_data++;if(!q.pass){r.reasons.push(q.reason);audit.push(r);continue;}counts.quality++;r.stages.quality=true;
   const event=active;
   if(!event?.ttm||!C.finite(event.z_rev)||!(event.yoy>.10&&event.accel>.05&&event.z_rev>1&&event.ttm.opm>0)){r.reasons.push('NO_ACTIVE_REVENUE_EVENT');audit.push(r);continue;}counts.revenue++;r.stages.revenue=true;r.event_id=event.event_id;r.month=event.month;r.d0=event.d0;
   const first=g.eventLog.find(e=>e.event_id===event.event_id&&['FIRST_QUALIFYING_CLOSE','PENDING_OPEN','FIRST_ATTEMPT_DATA_UNAVAILABLE'].includes(e.status));
   if(!first||first.signalDate!==day||!['FIRST_QUALIFYING_CLOSE','PENDING_OPEN'].includes(first.status)){r.reasons.push(first?.signalDate&&first.signalDate<day?'EVENT_ALREADY_ATTEMPTED':'NO_FIRST_BREAKOUT_TODAY');audit.push(r);continue;}
   const prior=cal.slice(-21,-1).map(d=>s.prices.find(r=>r.date===d)),adv=prior.every(v=>C.finite(v?.value_twd)&&v.value_twd>0)?C.mean(prior.map(v=>v.value_twd)):null;
   if(!C.finite(adv)||adv<min_adv_value){r.reasons.push('LIQUIDITY_GATE');audit.push(r);continue;}r.adv_value=adv;counts.technical++;r.stages.technical=true;
   const f=R.ifp(s,cal,i,as_of,p);if(institution&&!C.finite(f)){r.reasons.push('INSTITUTION_DATA_MISSING');audit.push(r);continue;}
   counts.institution++;r.stages.institution=true;Object.assign(r,{z_rev:event.z_rev,yoy:event.yoy,accel:event.accel,rs20:x.rs20,ifp5:f,referenceClose:x.row.close,advVolume:x.advVolume,atr:x.atr,signalDate:day,decisionAt:as_of,event_origin:event.event_origin,reason:'FIRST_EVENT_BREAKOUT'});eligible.push(r);audit.push(r);
  }
  const failures=u.collection_errors??[],expected=u.expected_symbols??stocks.map(s=>s.symbol),membership=expected.length===stocks.length&&new Set(expected).size===expected.length&&stocks.every(s=>expected.includes(s.symbol)),complete=membership&&!audit.some(r=>r.reasons.includes('INSTITUTION_DATA_MISSING'))&&u.coverage_complete!==false&&!failures.length&&counts.valid_data===stocks.filter(s=>!s.financial_industry&&!/金融|保險|Financial|Insurance|Bank/i.test(s.industry??'')).length;
  const fullPool=complete?R.rank(eligible,institution,ranking):[];counts.recommendable=fullPool.length;
  const noIfpSamePool=complete?R.rank(eligible,false,'weighted').map(r=>({symbol:r.symbol,score:r.score})):[];
  const taken=new Set([...locked.map(s=>s.symbol),...held_symbols]),sector=Object.create(null);for(const r of locked)sector[r.industry??'unknown']=(sector[r.industry??'unknown']??0)+.2;
  const recommendations=[],unselected=[];let available=Math.max(0,slots-locked.length);
  for(const r of fullPool){let reason=null;if(taken.has(r.symbol))reason=held_symbols.includes(r.symbol)?'ALREADY_HELD':'LOCKED_SLOT';else if(!available)reason='SLOT_LIMIT';else if((sector[r.industry]??0)+.2>.4000001)reason='SECTOR_LIMIT';
   // A reference-close budget test is a diagnostic, not an opening fill or order.
   const fill=C.buy(10000000*.2,r.referenceClose,C.costs({capital:1e7,fee:.001425,slip:.0005,minFee:20,lot:1000,tax:.003}),r.advVolume*.01);
   if(!reason&&!fill)reason='REFERENCE_BUDGET_OR_CAPACITY';if(reason){unselected.push({symbol:r.symbol,reason});continue;}
   recommendations.push({...r,score_rank:fullPool.findIndex(x=>x.symbol===r.symbol)+1,indicative_units:fill.units,execution_status:'RESEARCH_CANDIDATE_NOT_ORDER',audit:{version:VERSION,as_of,event_id:r.event_id}});available--;taken.add(r.symbol);sector[r.industry]=(sector[r.industry]??0)+.2;
  }
  counts.selected=recommendations.length;
  return {version:VERSION,quality_version:QUALITY,as_of,signal_date:day,market:'TW',availability,counts,coverage_complete:complete,collection_errors:failures,status:complete?'SNAPSHOT_RESEARCH_ONLY':'PARTIAL_NO_NEW_RANKING',candidate_pool:u.manifest?.candidate_pool??stocks.map(s=>s.symbol),ranked:fullPool,recommendations,unselected,audit,no_ifp_same_pool:noIfpSamePool,options:{institution,ranking,min_adv_value,slots,capital:1e7,max_weight:.2,sector_weight:.4},not_historical_portfolio:true,gates:{G0:false,G1:false,G2:false,G3:false}};
 }
 return {VERSION,QUALITY,WATCHLIST,pool,selected,flowQuarters,quality,screen};
})();
if(typeof module!=='undefined')module.exports=AutoScreen;
