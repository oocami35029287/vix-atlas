/* REV-MOM-v1.1. Pure, causal research engine; no data fetching or orders. */
const RevMomEngine=(()=>{
 const C=typeof module!=='undefined'?require('./research_core.js'):ResearchCore;
 const Chip=typeof module!=='undefined'?require('./chip_engine.js'):ChipEngine;
 const spec='REV-MOM-v1.1';
 const median=a=>{const s=[...a].sort((x,y)=>x-y),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;};
 const monthIndex=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m)?+m.slice(0,4)*12+(+m.slice(5)-1):NaN;
 const monthName=n=>Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0');
 const cutoff=d=>d+'T08:30:00+08:00';
 function config(o={}){
  const p=C.costs({exit:'F20',holding:20,ranking:'weighted',availability:'strict',execution:'strict',institution:true,capital:1000000,fee:.001425,tax:.003,slip:.0005,minFee:20,lot:1000,maxPositions:5,maxWeight:.2,sectorWeight:.4,participation:.01,...o});
  if(!['F20','M30'].includes(p.exit)||![10,20,30].includes(p.holding)||!['weighted','symbol'].includes(p.ranking)||!['strict','proxy'].includes(p.availability)||!['strict','daily-proxy'].includes(p.execution))throw Error('REV-MOM 設定無效');
  if(p.maxPositions<1||p.maxPositions>5||!Number.isInteger(p.maxPositions)||[p.maxWeight,p.sectorWeight,p.participation].some(x=>!C.finite(x)||x<=0||x>1)||!Number.isInteger(p.lot)||p.lot<1)throw Error('REV-MOM 配置或交易單位無效');
  p.variant=spec+(p.institution?'-IFP':'-NO-IFP')+'-'+p.exit+(p.exit==='F20'?'-h'+p.holding:'');return p;
 }
 function available(v,p){
  if(!v||!Number.isFinite(Date.parse(v.available_from)))return false;
  if(p.availability==='proxy')return true;
  return ['historical_evidence','observed'].includes(v.availability_basis)&&['timestamp','date'].includes(v.timestamp_precision)&&v.source_timezone==='Asia/Taipei'&&typeof v.revision_id==='string'&&/([+-]\d\d:\d\d|Z)$/.test(v.available_from)&& (v.availability_basis!=='observed'||(Number.isFinite(Date.parse(v.first_seen_at))&&Date.parse(v.first_seen_at)<=Date.parse(v.available_from)))&& (v.timestamp_precision!=='date'||(v.date_only_conservative===true&&/T23:59:59\+08:00$/.test(v.available_from)));
 }
 function versions(record){return record.versions??[record];}
 function select(record,at,p){const vs=versions(record).filter(v=>available(v,p)&&Date.parse(v.available_from)<=Date.parse(at)).sort((a,b)=>Date.parse(a.available_from)-Date.parse(b.available_from)||String(a.revision_id).localeCompare(String(b.revision_id)));return vs.length?{...record,...vs.at(-1)}:null;}
 function revenueFeatures(records,month,at,p=config()){
  const mi=monthIndex(month);if(!Number.isFinite(mi))return null;
  const map=new Map(records.map(r=>[r.month,r]));const h=[];
  for(let j=mi-24;j<=mi;j++){const raw=map.get(monthName(j)),r=raw&&select(raw,at,p);if(!r||!C.finite(r.revenue)||r.revenue<=0||r.comparable!==true)return null;h.push(r);}
  if(['scope','currency','unit'].some(k=>!h[0][k]||new Set(h.map(r=>r[k])).size!==1))return null;
  const gs=h.slice(12).map((r,j)=>Math.log(r.revenue/h[j].revenue)),prev=gs.slice(0,12),med=median(prev),mad=median(prev.map(x=>Math.abs(x-med)));
  const yoy=h[24].revenue/h[12].revenue-1,accel=yoy-C.mean([21,22,23].map(i=>h[i].revenue/h[i-12].revenue-1));
  return {month,yoy,accel,z_rev:(gs.at(-1)-med)/Math.max(1.4826*mad,.05),revenue_revisions:h.map(r=>r.revision_id)};
 }
 function singleQuarters(records,at,p=config()){
  const rows=records.map(r=>select(r,at,p)).filter(Boolean),map=new Map(rows.map(r=>[r.period,r]));return rows.map(r=>{
   const m=/^(\d{4})-Q([1-4])$/.exec(r.period);if(!m||r.comparable!==true||!r.scope||!r.currency||!r.unit)return null;
   let revenue=r.revenue,operating_income=r.operating_income;
   if(r.value_kind==='cumulative'&&+m[2]>1){const prev=map.get(m[1]+'-Q'+(+m[2]-1));if(!prev||prev.scope!==r.scope||prev.currency!==r.currency||prev.unit!==r.unit||prev.value_kind!=='cumulative'||prev.comparable!==true)return null;revenue-=prev.revenue;operating_income-=prev.operating_income;}
   else if(!['single','cumulative'].includes(r.value_kind))return null;
   return C.finite(revenue)&&revenue>0&&C.finite(operating_income)?{...r,revenue,operating_income,qi:+m[1]*4+(+m[2]-1)}:null;
  }).filter(Boolean).sort((a,b)=>a.qi-b.qi);
 }
 function ttm(records,at,p=config()){
  const h=singleQuarters(records,at,p).slice(-4);if(h.length!==4||h.some((r,i)=>i&&r.qi!==h[i-1].qi+1)||['scope','currency','unit'].some(k=>new Set(h.map(r=>r[k])).size!==1))return null;
  return {opm:h.reduce((s,r)=>s+r.operating_income,0)/h.reduce((s,r)=>s+r.revenue,0),periods:h.map(r=>r.period),revisions:h.map(r=>r.revision_id)};
 }
 function indicators(stock,cal,p=config({availability:'proxy'})){
  const map=new Map(stock.prices.map(r=>[r.date,r])),out=[];let ema=null;
  for(let i=0;i<cal.length;i++){
   const at=cal[i+1]?cutoff(cal[i+1]):cal[i]+'T23:59:59+08:00';const resolve=r=>p.availability==='proxy'?r:known(r,at,p)?select(r,at,p):null;const row=resolve(map.get(cal[i]));const h=cal.slice(Math.max(0,i-20),i+1).map(d=>resolve(map.get(d)));if((stock.corporate_actions??[]).some(a=>a.type==='split'&&a.date===cal[i]))ema=null;
   const complete=n=>h.length>=n&&h.slice(-n).every(r=>r&&C.finite(r.close)&&r.close>0);
   if(!row||!C.finite(row.close)){ema=null;out.push(null);continue;}
   if(ema===null){if(complete(10))ema=C.mean(h.slice(-10).map(r=>r.close));}else ema=row.close*2/11+ema*9/11;
   let atr=null;if(complete(15)&&h.slice(-14).every(r=>C.finite(r.high)&&C.finite(r.low)&&r.high>=r.low&&r.low>0)){
    const a=h.slice(-15);atr=C.mean(a.slice(1).map((r,j)=>Math.max(r.high-r.low,Math.abs(r.high-a[j].close),Math.abs(r.low-a[j].close))));
   }
   const split=(stock.corporate_actions??[]).some(a=>a.type==='split'&&a.date>=cal[Math.max(0,i-20)]&&a.date<=cal[i]);
   out.push({row,ema,atr,sma20:complete(20)?C.mean(h.slice(-20).map(r=>r.close)):null,high10:complete(11)?Math.max(...h.slice(-11,-1).map(r=>r.close)):null,rs20:complete(21)?row.close/h[0].close-1:null,advVolume:complete(21)&&h.slice(0,-1).every(r=>C.finite(r.volume_shares)&&r.volume_shares>0)?C.mean(h.slice(0,-1).map(r=>r.volume_shares)):null,split});
  }return out;
 }
 function known(row,at,p){if(!row)return false;if(p.availability==='proxy')return true;const r=select(row,at,p);return !!r&&r.bar_state==='final'&&typeof r.finality_evidence==='string'&&r.finality_evidence.length>0;}
 function ifp(stock,cal,i,at,p){
  if(i<4)return null;const map=new Map(stock.prices.map(r=>[r.date,r]));const h=cal.slice(i-4,i+1).map(d=>{const r=map.get(d);if(!r)return null;return p.availability==='proxy'?r:Chip.version(r,at,{availability:'strict'});});
  if(h.some(r=>!r||!C.finite(r.volume_shares)||r.volume_shares<=0||!C.finite(r.foreign_net_shares)||!C.finite(r.trust_net_shares)))return null;
  return h.reduce((s,r)=>s+r.foreign_net_shares+r.trust_net_shares,0)/h.reduce((s,r)=>s+r.volume_shares,0);
 }
 function rank(candidates,institution=true,ranking='weighted'){
  if(candidates.some(s=>![s.z_rev,s.rs20,...(institution?[s.ifp5]:[])].every(C.finite)))throw Error('排名缺值不可填零');
  const a=candidates.map(x=>({...x})),z=C.percentile(a.map(x=>x.z_rev)),rs=C.percentile(a.map(x=>x.rs20)),f=institution?C.percentile(a.map(x=>x.ifp5)):[];
  a.forEach((x,i)=>x.score=institution?.5*z[i]+.25*rs[i]+.25*f[i]:(2*z[i]+rs[i])/3);
  return a.sort((a,b)=>(ranking==='weighted'?b.score-a.score:0)||a.symbol.localeCompare(b.symbol,'en'));
 }
 function createSignals(u,o={}){
  Chip.validateUniverse(u);const p=config(o),cal=u.calendar,signals=[],eventLog=[],coverage=[];const data=u.symbols.map(s=>indicators(s,cal,p));
  const benchmark=u.benchmark?indicators(u.benchmark,cal,p):[];
  for(const rows of data)for(let i=0;i<rows.length;i++)if(rows[i])rows[i].rs20=C.finite(rows[i].rs20)&&C.finite(benchmark[i]?.rs20)?rows[i].rs20-benchmark[i].rs20:null;
  for(let si=0;si<u.symbols.length;si++){
   const s=u.symbols[si];if(s.financial_industry===true||/金融|保險|Financial|Insurance|Bank/i.test(s.industry??'')){eventLog.push({symbol:s.symbol,status:'EXCLUDED_FINANCIAL'});continue;}
   const byMonth=new Map();for(const r of s.revenues??[]){if(!Number.isFinite(monthIndex(r.month)))throw Error('營收月份無效');if(!byMonth.has(r.month))byMonth.set(r.month,{...r,versions:[]});byMonth.get(r.month).versions.push(...versions(r).map(v=>({...r,...v,versions:undefined})));}
   const records=[...byMonth.values()].sort((a,b)=>a.month.localeCompare(b.month));
   for(const r of records){
    const event_id=[s.security_id??s.symbol,'monthly_revenue',r.month].join(':'),base={event_id,symbol:s.symbol,month:r.month,event_origin:r.event_origin??'historical_backfill'};
    const first=versions(r).filter(v=>available(v,p)).sort((a,b)=>Date.parse(a.available_from)-Date.parse(b.available_from))[0];
    if(!first){eventLog.push({...base,status:'HISTORICAL_VERSION_UNAVAILABLE'});continue;}
    const d0=cal.findIndex(d=>Date.parse(cutoff(d))>=Date.parse(first.available_from));if(d0<0){eventLog.push({...base,status:'NOT_YET_AVAILABLE'});continue;}
    // d0 is immutable even when financial data is missing or a later revision arrives.
    const f=revenueFeatures(records,r.month,cutoff(cal[d0]),p),fin=ttm(s.financials??[],cutoff(cal[d0]),p),frozen={...base,d0:cal[d0],frozen_at:cutoff(cal[d0]),...f,ttm:fin};
    if(!f||!fin){eventLog.push({...frozen,status:'INSUFFICIENT_ASOF_HISTORY'});continue;}
    if(!(f.yoy>.10&&f.accel>.05&&f.z_rev>1&&fin.opm>0)){eventLog.push({...frozen,status:'FUNDAMENTALS_REJECTED'});continue;}
    let found=false;
    for(let i=d0;i<Math.min(cal.length,d0+5);i++){
     const x=data[si][i];if(!x||!C.finite(x.sma20)||!C.finite(x.high10)){found=true;eventLog.push({...frozen,status:'FIRST_ATTEMPT_DATA_UNAVAILABLE',date:cal[i]});break;}if(x.split||!(x.row.close>x.sma20&&x.row.close>x.high10))continue;
     found=true;const executionDate=cal[i+1]??null,at=executionDate?cutoff(executionDate):null;
     const ifp5=at&&p.institution?ifp(s,cal,i,at,p):null;
     const sgn={...frozen,...f,symbol:s.symbol,industry:s.industry??'unknown',signalDate:cal[i],executionDate,decisionAt:at,referenceClose:x.row.close,rs20:x.rs20,ifp5,atr:x.atr,advVolume:x.advVolume,signal_id:event_id,source_revision:x.row.revision_id??null};
     const hist=cal.slice(Math.max(0,i-20),i+1).map(d=>s.prices.find(r=>r.date===d));
     if(!at){signals.push({...sgn,status:'PENDING_OPEN'});eventLog.push({...sgn,status:'PENDING_OPEN'});break;}
     if(hist.length<21||hist.some(r=>!known(r,at,p))||!C.finite(x.rs20)||!C.finite(x.advVolume)||(p.institution&&!C.finite(ifp5))||((p.exit==='M30'||p.requireAtr)&&(!C.finite(x.atr)||x.atr<=0))){eventLog.push({...sgn,status:'FIRST_ATTEMPT_DATA_UNAVAILABLE'});break;}
     if((p.start&&cal[i]<p.start)||(p.end&&cal[i]>p.end)){eventLog.push({...sgn,status:'OUTSIDE_RESEARCH_RANGE'});break;}
     signals.push(sgn);eventLog.push({...sgn,status:'FIRST_QUALIFYING_CLOSE'});break;
    }
    if(!found)eventLog.push({...frozen,status:'WINDOW_EXPIRED'});
   }
  }
  const sealed=[];
  for(const date of [...new Set(signals.map(s=>s.executionDate))]){
   const pool=signals.filter(s=>s.executionDate===date);if(!date){sealed.push(...pool);continue;}
   const i=cal.indexOf(date)-1,at=cutoff(date);
   const complete=u.coverage_complete!==false&&u.symbols.every((s,j)=>{const x=data[j][i];return x&&!x.split&&C.finite(x.rs20)&&C.finite(x.advVolume)&&cal.slice(Math.max(0,i-20),i+1).every(d=>known(s.prices.find(r=>r.date===d),at,p))&&(!p.institution||C.finite(ifp(s,cal,i,at,p)));});
   coverage.push({date,complete,expected:u.symbols.length,candidates:pool.length});
   if(complete)rank(pool,p.institution,p.ranking).forEach((s,j)=>sealed.push({...s,rank:j+1}));
   else for(const s of pool)eventLog.push({...s,status:'PARTIAL_CROSS_SECTION'});
  }
  return {signals:sealed,eventLog,coverage,options:p,indicators:data};
 }
 function simulatePortfolio(u,o={}){
  const g=createSignals(u,o),p=g.options,stops=[];
  const base=Chip.simulateSignals(u,{...g,options:{...p,holding:p.exit==='M30'?30:p.holding}},{
   executable:(row,options)=>Chip.executable(row,options)&&(p.lot>=1000||(u.odd_lot_execution_evidence===true&&u.odd_lot_fee_evidence===true&&u.execution_market==='TW-odd-lot')),
   onEntry:(e,equity)=>({highest:-Infinity,line:C.finite(e.atr)?e.price-2.5*e.atr:null,initial_risk_fraction:C.finite(e.atr)?e.units*2.5*e.atr/equity:null}),
   onSplit:(e,a)=>{if(C.finite(e.highest))e.highest/=a.ratio;if(C.finite(e.line))e.line/=a.ratio;},
   exitReasons:(e,i)=>[...new Set([...(e.exitReasons??[]),...(i>=e.targetIndex?['MAX_HOLDING']:[])])],
   onClose:({positions,index:i,date})=>{
    if(p.exit!=='M30')return;
    for(let j=0;j<u.symbols.length;j++){
     const stock=u.symbols[j],e=positions.get(stock.symbol);if(!e)continue;const x=g.indicators[j][i],at=u.calendar[i+1]?cutoff(u.calendar[i+1]):date+'T23:59:59+08:00';
     if(!x||!known(x.row,at,p)){e.belowPrevious=false;continue;}
     e.highest=Math.max(e.highest,x.row.close);if(C.finite(x.atr)&&x.atr>0)e.line=Math.max(e.line,e.highest-2.5*x.atr);
     const below=C.finite(x.ema)&&x.row.close<x.ema,reasons=[];if(C.finite(e.line)&&x.row.close<e.line)reasons.push('ATR_CLOSE');if(below&&e.belowPrevious)reasons.push('EMA10_TWO_CLOSES');
     if(reasons.length){e.exitReasons=[...new Set([...(e.exitReasons??[]),...reasons])];e.exitSignalDate=date;}e.belowPrevious=below;
     stops.push({date,symbol:stock.symbol,line:e.line,highest:e.highest,atr:x.atr,ema:x.ema});
    }
   }
  });
  if(p.lot<1000&&!(u.odd_lot_execution_evidence&&u.odd_lot_fee_evidence&&u.execution_market==='TW-odd-lot'))for(const e of base.orderEvents)if(e.status==='CANCELLED')e.reason='ODD_LOT_EVIDENCE_REQUIRED';
  return {...base,eventLog:g.eventLog,stops,options:p,pendingSignals:g.signals.filter(s=>!s.executionDate),spec,status:'RESEARCH_ONLY'};
 }
 return {spec,config,monthIndex,monthName,available,select,revenueFeatures,singleQuarters,ttm,indicators,rank,createSignals,simulatePortfolio};
})();
if(typeof module!=='undefined')module.exports=RevMomEngine;
