/* Versioned chip research. Strict evidence and proxy simulations are distinct. */
const ChipEngine = (() => {
  const C=typeof module!=='undefined'?require('./research_core.js'):ResearchCore;
  const horizons={S1:[1,2,3],S2:[3,5,10],S3:[10,20,30]};
  const signalCache=new WeakMap();
  function configuration(options={}) {
    const p=C.costs({strategy:'S2',holding:5,delay:1,availability:'strict',execution:'strict',capital:1000000,tax:.003,lot:1000,minFee:20,maxPositions:5,maxWeight:.2,sectorWeight:.4,participation:.01,ranking:'symbol',...options});
    if(!horizons[p.strategy]||!horizons[p.strategy].includes(p.holding)||![1,2].includes(p.delay)||!['strict','proxy'].includes(p.availability)||!['strict','daily-proxy'].includes(p.execution)||!['symbol','R1'].includes(p.ranking)||(p.ranking==='R1'&&p.strategy!=='S2'))throw Error('籌碼策略、持有期、資料情境或排名設定無效');
    if(!Number.isInteger(p.maxPositions)||p.maxPositions<1||p.maxPositions>5||[p.maxWeight,p.sectorWeight,p.participation].some(v=>!C.finite(v)||v<=0||v>1))throw Error('部位或容量限制無效');
    return p;
  }
  function validateUniverse(universe) {
    if(!universe||!Array.isArray(universe.calendar)||!universe.calendar.length||!Array.isArray(universe.symbols)||!universe.symbols.length||universe.symbols.length>5000)throw Error('需提供 calendar 與 symbols 籌碼資料包');
    const cal=universe.calendar;
    if(cal.some((d,i)=>!C.validDate(d)||(i&&d<=cal[i-1])))throw Error('交易日曆必須遞增且不重複');
    const ids=new Set();
    for(const s of universe.symbols){if(typeof s.symbol!=='string'||ids.has(s.symbol))throw Error('股票代號不可重複');ids.add(s.symbol);C.validateRows(s.prices);if(s.prices.some(r=>!cal.includes(r.date)))throw Error('行情日期不在市場交易日曆');}
  }
  function version(row,decisionAt,p) {
    if(!row)return null;
    const versions=row.chip_versions??[row];
    const eligible=versions.filter(v=>{
      if(p.availability==='proxy'&&v.availability_basis==='proxy')return true;
      return ['observed','historical_evidence'].includes(v.availability_basis)&&typeof v.available_from==='string'&&Number.isFinite(Date.parse(v.available_from))&&Date.parse(v.available_from)<=Date.parse(decisionAt);
    }).sort((a,b)=>Date.parse(a.available_from??0)-Date.parse(b.available_from??0));
    return eligible.length?{...row,...eligible.at(-1)}:null;
  }
  function featureAt(stock,calendar,index,p,mapping=null) {
    if(index<119)return null;
    const decisionDay=calendar[index+p.delay];
    // Latest signal can be shown, but cannot be filled without a future session.
    const decisionAt=decisionDay?decisionDay+'T08:30:00+08:00':null;
    if(!decisionAt&&p.availability==='strict')return null;
    // Do not compare unconverted shares or prices across a capital split.
    if((stock.corporate_actions??[]).some(a=>a.type==='split'&&a.date>=calendar[index-119]&&a.date<=calendar[index]))return null;
    const map=mapping??new Map(stock.prices.map(r=>[r.date,r]));
    const h=calendar.slice(index-119,index+1).map(d=>version(map.get(d),decisionAt??calendar[index]+'T23:59:59+08:00',p));
    if(h.some(r=>!r||!C.finite(r.close)||r.close<=0||!C.finite(r.volume_shares)||r.volume_shares<=0))return null;
    const t=h.at(-1),prior=h.slice(-21,-1);
    if(prior.some(r=>!C.finite(r.value_twd)||r.value_twd<=0))return null;
    const advValue=C.mean(prior.map(r=>r.value_twd)),advVolume=C.mean(prior.map(r=>r.volume_shares));
    const out={symbol:stock.symbol,industry:stock.industry??'unknown',date:calendar[index],signalDate:calendar[index],decisionAt,executionDate:decisionDay??null,index,close:t.close,advValue,advVolume,referenceClose:t.close,proxy:p.availability==='proxy',sourceVersion:t.revision_id??null};
    const intensity=r=>C.finite(r.foreign_net_shares)&&C.finite(r.trust_net_shares)?(r.foreign_net_shares+r.trust_net_shares)/r.volume_shares:null;
    for(const k of [1,5,10,20]){
      const window=h.slice(-k),valid=window.every(r=>C.finite(r.foreign_net_shares)&&C.finite(r.trust_net_shares));
      out['ifp'+k]=valid?window.reduce((v,r)=>v+r.foreign_net_shares+r.trust_net_shares,0)/window.reduce((v,r)=>v+r.volume_shares,0):null;
      out['tp'+k]=valid?window.filter(r=>r.trust_net_shares>0).length:null;
      const before=h[h.length-k-1];
      out['mp'+k]=C.finite(t.margin_balance_shares)&&C.finite(before.margin_balance_shares)?(t.margin_balance_shares-before.margin_balance_shares)/window.reduce((v,r)=>v+r.volume_shares,0):null;
    }
    const xs=h.slice(-61,-1).map(intensity),sigma=xs.every(C.finite)?C.std(xs):0;
    out.z60=sigma>0&&C.finite(out.ifp1)?(out.ifp1-C.mean(xs))/sigma:null;
    out.vr20=t.volume_shares/advVolume;out.sma20=C.mean(h.slice(-20).map(r=>r.close));out.sma60=C.mean(h.slice(-60).map(r=>r.close));
    out.previousClose=h.at(-2).close;
    const necessary=p.strategy==='S1'?[out.ifp1,out.z60]:p.strategy==='S2'?[out.ifp5,out.tp5,out.mp5]:[out.ifp20,out.tp20,out.mp20];
    if(necessary.some(v=>!C.finite(v)))return null;
    const threshold={S1:5e7,S2:3e7,S3:2e7}[p.strategy];
    const eligible=t.eligible!==false&&(!stock.listed_from||t.date>=stock.listed_from)&&(!stock.listed_to||t.date<=stock.listed_to);
    out.qualified=eligible&&advValue>=threshold&&(p.strategy==='S1'?out.ifp1>=.05&&out.z60>=1.5&&out.vr20>=1.2&&t.close>out.previousClose:p.strategy==='S2'?out.ifp5>=.03&&out.tp5>=3&&out.mp5<=0&&t.close>out.sma20:out.ifp20>=.02&&out.tp20>=10&&out.mp20<=.03&&t.close>out.sma60&&out.sma20>out.sma60);
    return out;
  }
  function rank(candidates,ranking='symbol') {
    const a=candidates.map(v=>({...v}));
    if(ranking==='R1'&&a.length){const f=C.percentile(a.map(x=>x.ifp5)),t=C.percentile(a.map(x=>x.tp5/5)),m=C.percentile(a.map(x=>x.mp5));a.forEach((x,i)=>x.score=f[i]+t[i]-m[i]);}
    return a.sort((x,y)=>(ranking==='R1'?y.score-x.score:0)||x.symbol.localeCompare(y.symbol,'en'));
  }
  function createSignals(universe,options={}) {
    const p=configuration(options),key=JSON.stringify([p.strategy,p.delay,p.availability,p.ranking,p.start,p.end]);
    const cached=options.cache===true?signalCache.get(universe)?.get(key):null;
    if(cached)return {...cached,options:p};
    validateUniverse(universe);const signals=[],coverage=[];
    const maps=universe.symbols.map(s=>new Map(s.prices.map(r=>[r.date,r])));
    for(let i=119;i<universe.calendar.length;i++){
      const date=universe.calendar[i];if((p.start&&date<p.start)||(p.end&&date>p.end))continue;
      const features=universe.symbols.map((s,j)=>featureAt(s,universe.calendar,i,p,maps[j])),available=features.filter(Boolean),qualified=available.filter(f=>f.qualified);
      const complete=available.length===universe.symbols.length;
      coverage.push({date,expected:universe.symbols.length,available:available.length,qualified:qualified.length,complete});
      // A partial cross-section never becomes a new ranking snapshot.
      if(!complete)continue;
      rank(qualified,p.ranking).forEach((s,j)=>signals.push({...s,signal_id:[p.strategy,p.ranking,s.symbol,date,p.delay].join(':'),rank:j+1}));
    }
    const result={signals,coverage,options:p};
    if(options.cache===true){if(!signalCache.has(universe))signalCache.set(universe,new Map());signalCache.get(universe).set(key,result);}
    return result;
  }
  function executable(row,p) {
    if(!row||!C.finite(row.open)||row.open<=0||!C.finite(row.volume_shares)||row.volume_shares<=0||row.trading_status==='suspended'||row.trading_status==='delisted'||row.tradable===false)return false;
    if(C.finite(row.limit_up)&&row.open>=row.limit_up||C.finite(row.limit_down)&&row.open<=row.limit_down)return false;
    if(p.execution==='strict'&&!(row.tradable===true&&C.finite(row.limit_up)&&C.finite(row.limit_down)))return false;
    return true;
  }
  function simulatePortfolio(universe,options={}) {
    const generated=createSignals(universe,options),p=generated.options,cal=universe.calendar,signals=generated.signals;
    const maps=new Map(universe.symbols.map(s=>[s.symbol,new Map(s.prices.map(r=>[r.date,r]))]));
    const curve=[],events=[],trades=[],orderEvents=[],ledger=[],positions=new Map(),lastPrices=new Map(),receivables=[];let cash=p.capital,pendingProceeds=0,exposure=0;
    const first=p.start??cal[0],end=p.end??cal.at(-1);
    for(let i=0;i<cal.length;i++){
      const date=cal[i];if(date<first||date>end)continue;
      cash+=pendingProceeds;pendingProceeds=0;
      // Corporate actions act on positions held before today's open.
      for(const stock of universe.symbols)for(const a of stock.corporate_actions??[]){
        const entry=positions.get(stock.symbol);if(!entry)continue;
        if(a.type==='split'&&a.date===date){
          if(!C.finite(a.ratio)||a.ratio<=0)throw Error('Invalid split ratio');
          entry.units*=a.ratio;entry.price/=a.ratio;if(lastPrices.has(stock.symbol))lastPrices.set(stock.symbol,lastPrices.get(stock.symbol)/a.ratio);
        }
        if(a.type==='dividend'&&a.ex_date===date){
          if(!C.finite(a.amount_per_share)||a.amount_per_share<0||!C.validDate(a.paid_date)||a.paid_date<date)throw Error('Invalid dividend action');
          const amount=entry.units*a.amount_per_share;entry.dividend_earned=(entry.dividend_earned??0)+amount;receivables.push({symbol:stock.symbol,paid_date:a.paid_date,amount});
          if(lastPrices.has(stock.symbol))lastPrices.set(stock.symbol,Math.max(0,lastPrices.get(stock.symbol)-a.amount_per_share));
        }
      }
      for(let j=receivables.length-1;j>=0;j--)if(receivables[j].paid_date<=date){cash+=receivables[j].amount;receivables.splice(j,1);}
      const marks=()=>[...positions].reduce((v,[symbol,e])=>v+e.units*(lastPrices.get(symbol)??e.price),0);
      const dividendReceivables=()=>receivables.reduce((sum,r)=>sum+r.amount,0);
      const preEquity=cash+marks()+dividendReceivables(),soldToday=new Set();
      const todays=signals.filter(s=>s.executionDate===date),selected=[];let reserved=0;
      const sectorValue={};for(const [symbol,e] of positions)sectorValue[e.industry]=(sectorValue[e.industry]??0)+e.units*(lastPrices.get(symbol)??e.price);
      // Selection is sealed using prior-close marks, BEFORE observing this open.
      for(const s of todays){
        let reason=null;if(positions.has(s.symbol))reason='ALREADY_HELD';else if(positions.size+selected.length>=p.maxPositions)reason='POSITION_LIMIT';
        const budget=Math.max(0,Math.min(preEquity*p.maxWeight,preEquity*p.sectorWeight-(sectorValue[s.industry]??0),cash-reserved));
        if(!reason&&budget<Math.max(p.minFee,s.referenceClose*(p.lot||1)))reason='BUDGET_OR_SECTOR_LIMIT';
        if(reason){orderEvents.push({...s,date,status:'NOT_SELECTED',reason});continue;}
        selected.push({...s,budget});reserved+=budget;sectorValue[s.industry]=(sectorValue[s.industry]??0)+budget;
      }
      for(const [symbol,e] of positions){
        if(i<e.targetIndex)continue;
        const row=maps.get(symbol).get(date);
        if(!executable(row,p)){orderEvents.push({date,symbol,side:'SELL',status:'BLOCKED',reason:'UNEXECUTABLE',signal_id:e.signal_id});continue;}
        const fill=C.sell(e.units,row.open,p);pendingProceeds+=fill.proceeds;
        const totalProceeds=fill.proceeds+(e.dividend_earned??0);
        trades.push({...e,exitDate:date,exitPrice:fill.price,exitCommission:fill.commission,tax:fill.tax,proceeds:fill.proceeds,totalProceedsIncludingDividends:totalProceeds,pnl:totalProceeds-e.cost,return:totalProceeds/e.cost-1,holdingDays:i-e.index});
        events.push({date,symbol,side:'SELL',price:fill.price,units:e.units,signalDate:e.signalDate});positions.delete(symbol);soldToday.add(symbol);
      }
      for(const s of selected){
        const row=maps.get(s.symbol).get(date);
        const fill=!soldToday.has(s.symbol)&&executable(row,p)?C.buy(Math.min(s.budget,cash),row.open,p,s.advVolume*p.participation):null;
        if(!fill){orderEvents.push({...s,date,side:'BUY',status:'CANCELLED',reason:'UNEXECUTABLE_OR_LOT'});continue;}
        const e={...s,...fill,date,index:i,targetIndex:i+p.holding,targetExitDate:cal[i+p.holding]??null};
        positions.set(s.symbol,e);cash-=fill.cost;events.push({date,symbol:s.symbol,side:'BUY',price:fill.price,units:fill.units,signalDate:s.signalDate});
      }
      for(const s of universe.symbols){const row=maps.get(s.symbol).get(date);if(row&&C.finite(row.close))lastPrices.set(s.symbol,row.close);}
      const equity=cash+pendingProceeds+marks()+dividendReceivables();
      if(positions.size)exposure++;
      curve.push({date,equity});ledger.push({date,available_cash:cash,pending_sale_proceeds:pendingProceeds,dividend_receivables:dividendReceivables(),equity,positions:[...positions].map(([symbol,e])=>({symbol,units:e.units,mark:lastPrices.get(symbol)??e.price,targetExitDate:e.targetExitDate}))});
      if(cash<-.00001)throw Error('Accounting invariant: negative cash');
    }
    const unresolved=[...positions.values()].map(e=>({...e,status:e.targetExitDate&&e.targetExitDate<=end?'EXIT_BLOCKED':'OPEN_AT_END'}));
    return C.summary(curve,trades,p.capital,{signals,coverage:generated.coverage,events,orderEvents,ledger,dividendReceivables:receivables,positions:unresolved,censored:unresolved,entry:unresolved[0]??null,exposure:curve.length?exposure/curve.length:0,options:p,gates:{G0:p.availability==='strict'&&universe.evidence_complete===true&&universe.corporate_actions_complete===true&&universe.point_in_time_universe===true,G1:false,G2:false,G3:false},model:p.execution==='strict'?'strict execution evidence':'daily proxy: ignores unknown opening limits; not executable signals'});
  }
  function eventStudy(universe,options={}) {
    const {signals,options:p,coverage}=createSignals(universe,options),out=[];
    const maps=new Map(universe.symbols.map(s=>[s.symbol,new Map(s.prices.map(r=>[r.date,r]))]));
    for(const s of signals){
      const i=universe.calendar.indexOf(s.executionDate),map=maps.get(s.symbol);
      if(i<0){out.push({...s,status:'PENDING'});continue;}
      const e=map.get(universe.calendar[i]);if(!executable(e,p)){out.push({...s,status:'ENTRY_REJECTED'});continue;}
      const fill=C.buy(p.capital,e.open,p,s.advVolume*p.participation);if(!fill){out.push({...s,status:'ENTRY_REJECTED'});continue;}
      let j=i+p.holding;
      while(j<universe.calendar.length&&(!p.end||universe.calendar[j]<=p.end)&&!executable(map.get(universe.calendar[j]),p))j++;
      if(j>=universe.calendar.length||(p.end&&universe.calendar[j]>p.end)){out.push({...s,status:'CENSORED'});continue;}
      const exit=map.get(universe.calendar[j]),stock=universe.symbols.find(x=>x.symbol===s.symbol);let units=fill.units,dividends=0;
      for(let k=i+1;k<=j;k++)for(const a of stock.corporate_actions??[]){
        if(a.type==='split'&&a.date===universe.calendar[k]){if(!C.finite(a.ratio)||a.ratio<=0)throw Error('Invalid split ratio');units*=a.ratio;}
        if(a.type==='dividend'&&a.ex_date===universe.calendar[k]){if(!C.finite(a.amount_per_share)||a.amount_per_share<0)throw Error('Invalid dividend');dividends+=units*a.amount_per_share;}
      }
      const sale=C.sell(units,exit.open,p);
      out.push({...s,status:'CLOSED',entryDate:e.date,exitDate:exit.date,holdingDays:j-i,grossReturn:(units*exit.open+dividends)/(fill.units*e.open)-1,netReturn:(sale.proceeds+dividends)/fill.cost-1});
    }
    const completed=out.filter(x=>x.status==='CLOSED');
    return {events:out,coverage,count:out.length,completed:completed.length,signalDates:new Set(out.map(x=>x.signalDate)).size,mean:completed.length?C.mean(completed.map(x=>x.netReturn)):null,median:completed.length?completed.map(x=>x.netReturn).sort((a,b)=>a-b)[Math.floor(completed.length/2)]:null};
  }
  return {configuration,validateUniverse,version,featureAt,rank,createSignals,executable,simulatePortfolio,simulateSingleSymbol:(stock,calendar,options)=>simulatePortfolio({symbols:[stock],calendar},options),eventStudy,horizons};
})();
if(typeof module!=='undefined')module.exports=ChipEngine;
