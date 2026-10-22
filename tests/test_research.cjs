const {test}=require('node:test');
const A=require('node:assert/strict');
const C=require('../research_core.js'),B=require('../bb_engine.js'),E=require('../chip_engine.js'),S=require('../research_statistics.js');
function days(n){const out=[];let d=new Date('2024-01-01T00:00:00Z');while(out.length<n){if(d.getUTCDay()%6!==0)out.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1);}return out;}
function fixture(n=155,stocks=6){const calendar=days(n);return {calendar,evidence_complete:true,symbols:Array.from({length:stocks},(_,j)=>({symbol:'TEST'+j,industry:'group'+Math.floor(j/2),prices:calendar.map((date,i)=>({date,open:100+i*.5,close:100.3+i*.5,volume_shares:1000000,value_twd:150000000,foreign_net_shares:40000,trust_net_shares:10000,margin_balance_shares:500000,availability_basis:'historical_evidence',available_from:date+'T18:00:00+08:00',tradable:true,limit_up:1000,limit_down:1}))}))};}
const config={strategy:'S2',holding:5,capital:1e7,fee:0,slip:0,tax:0,minFee:0,lot:1};
test('Bollinger population standard deviation and strict warmup',()=>{
 const r=[1,2,3,4,5,6].map((close,i)=>({date:days(6)[i],open:close,close}));const b=B.indicators(r,5,2);
 A.equal(b[3].mid,null);A.equal(b[4].mid,3);A.ok(Math.abs(b[4].upper-(3+2*Math.sqrt(2)))<1e-10);
 A.throws(()=>B.indicators([...r].reverse(),5,2));A.throws(()=>B.indicators([...r,r.at(-1)],5,2));A.throws(()=>B.indicators(r,5,Infinity));
});
test('Bollinger signals enter only at a later open, final signal stays pending',()=>{
 const close=[10,10,10,10,10,10,3,9,10,11,10,10];const prices=close.map((v,i)=>({date:days(close.length)[i],open:v+1,close:v}));
 const r=B.run(prices,{period:5,k:1,capital:10000,fee:0,slip:0});A.ok(r.signals.length>0);
 for(const e of r.events)A.ok(e.date>e.signalDate);
 const endSignal=r.signals.find(s=>s.side==='BUY');const partial=B.run(prices.filter(p=>p.date<=endSignal.date),{period:5,k:1,fee:0,slip:0});A.equal(partial.events.length,0);A.equal(partial.pending.side,'BUY');
 const changed=prices.map((r,i)=>({...r,close:i>8?r.close*10:r.close}));A.deepEqual(B.run(changed,{period:5,k:1}).signals.filter(s=>s.date<=prices[8].date),B.run(prices,{period:5,k:1}).signals.filter(s=>s.date<=prices[8].date));
});
test('as-of version selection never uses later revisions; proxy is explicit',()=>{
 const p=E.configuration();const row={date:'2024-01-01',chip_versions:[{available_from:'2024-01-01T18:00:00+08:00',availability_basis:'observed',trust_net_shares:10},{available_from:'2024-01-03T18:00:00+08:00',availability_basis:'observed',trust_net_shares:999}]};
 A.equal(E.version(row,'2024-01-02T08:30:00+08:00',p).trust_net_shares,10);
 A.equal(E.version({...row,chip_versions:[{availability_basis:'proxy',trust_net_shares:5}]},'2024-01-02T08:30:00+08:00',p),null);
 A.equal(E.version({availability_basis:'proxy',trust_net_shares:5},'2024-01-02T08:30:00+08:00',E.configuration({availability:'proxy'})).trust_net_shares,5);
});
test('features have fixed windows, missing != zero, S1 does not require margin',()=>{
 const u=fixture(),p=E.configuration(config);A.equal(E.featureAt(u.symbols[0],u.calendar,118,p),null);
 const f=E.featureAt(u.symbols[0],u.calendar,119,p);A.equal(f.ifp5,.05);A.equal(f.mp5,0);A.equal(f.tp5,5);A.equal(f.qualified,true);
 u.symbols[0].prices[110].trust_net_shares=null;A.equal(E.featureAt(u.symbols[0],u.calendar,119,p).ifp20,null);
 u.symbols[0].prices[118].margin_balance_shares=null;A.equal(E.featureAt(u.symbols[0],u.calendar,119,p).qualified,true);
 u.symbols[0].prices[114].margin_balance_shares=null;A.equal(E.featureAt(u.symbols[0],u.calendar,119,p),null);
 const v=fixture();for(const r of v.symbols[0].prices){r.foreign_net_shares+=Math.round(Math.sin(v.calendar.indexOf(r.date))*3000);r.margin_balance_shares=null;}
 const sf=E.featureAt(v.symbols[0],v.calendar,119,E.configuration({strategy:'S1',holding:2}));A.ok(sf!==null);A.equal(sf.mp5,null);A.ok(Number.isFinite(sf.z60));
});
test('R1 average ties, one candidate and no candidates deterministic',()=>{
 A.deepEqual(C.percentile([3,3,1]),[.75,.75,0]);A.deepEqual(C.percentile([3]),[.5]);A.deepEqual(E.rank([],'R1'),[]);
 const a=[{symbol:'B',ifp5:.1,tp5:3,mp5:0},{symbol:'A',ifp5:.1,tp5:3,mp5:0}];A.deepEqual(E.rank(a,'R1').map(x=>[x.symbol,x.score]),[['A',.5],['B',.5]]);
 const u=fixture();A.deepEqual(E.createSignals(u,config).signals.map(s=>[s.symbol,s.signalDate]),E.createSignals(u,{...config,ranking:'R1'}).signals.map(s=>[s.symbol,s.signalDate]));
});
test('fixed h uses actual entry date; T+2 shifts exit; fees reduce net wealth',()=>{
 const u=fixture(),r=E.simulatePortfolio(u,config),delayed=E.simulatePortfolio(u,{...config,delay:2});A.ok(r.trades.length>0);
 A.equal(r.trades[0].date,u.calendar[120]);A.equal(r.trades[0].exitDate,u.calendar[125]);A.equal(delayed.trades[0].date,u.calendar[121]);A.equal(delayed.trades[0].exitDate,u.calendar[126]);
 A.ok(E.simulatePortfolio(u,{...config,fee:.001425,tax:.003,slip:.0015}).end<r.end);
});
test('failed buy cancels, never fills a replacement at the same open',()=>{
 const u=fixture();u.symbols[0].prices[120].tradable=false;
 const r=E.simulatePortfolio(u,config),first=r.events.filter(e=>e.date===u.calendar[120]&&e.side==='BUY');A.equal(first.length,4);A.ok(!first.some(e=>e.symbol==='TEST5'));A.ok(r.orderEvents.some(e=>e.symbol==='TEST0'&&e.status==='CANCELLED'));
});
test('blocked exits remain positions; calendar suspension days count toward h',()=>{
 const u=fixture();u.symbols[0].prices[125].tradable=false;u.symbols[0].prices[126].tradable=false;
 const r=E.simulatePortfolio(u,config),trade=r.trades.find(t=>t.symbol==='TEST0');A.equal(trade.exitDate,u.calendar[127]);A.equal(trade.holdingDays,7);A.equal(r.orderEvents.filter(e=>e.symbol==='TEST0'&&e.status==='BLOCKED').length,2);
 for(const e of r.events.filter(e=>e.side==='SELL'))A.ok(!r.events.some(b=>b.side==='BUY'&&b.symbol===e.symbol&&b.date===e.date));
});
test('sector exposure includes existing positions; cash, pending sale proceeds and equity conserve',()=>{
 const u=fixture(),r=E.simulatePortfolio(u,config);
 for(const l of r.ledger){A.ok(l.available_cash>=0);A.ok(l.positions.length<=5);const expected=l.available_cash+l.pending_sale_proceeds+l.positions.reduce((v,e)=>v+e.units*e.mark,0);A.ok(Math.abs(expected-l.equity)<1e-6);}
 const sellDay=r.ledger.find(l=>l.pending_sale_proceeds>0);A.ok(sellDay);A.ok(sellDay.equity>=sellDay.pending_sale_proceeds);A.ok(r.censored.length>=0);
 const end=E.simulatePortfolio(u,{...config,end:u.calendar[122]});A.ok(end.censored.length>0);A.equal(end.trades.length,0);
});
test('partial cross-sections and unknown opening limits produce no certified fills',()=>{
 const u=fixture();u.symbols[0].prices=u.symbols[0].prices.filter((r,i)=>i!==118);A.ok(!E.createSignals(u,config).signals.some(s=>s.signalDate===u.calendar[119]));
 const v=fixture();for(const s of v.symbols)for(const r of s.prices){delete r.limit_up;delete r.limit_down;}
 A.equal(E.simulatePortfolio(v,config).events.length,0);A.ok(E.simulatePortfolio(v,{...config,execution:'daily-proxy'}).events.length>0);
});
test('future rows never rewrite completed earlier trades or signals',()=>{
 const u=fixture(150),a=E.simulatePortfolio(u,config),v=fixture(160);for(const s of v.symbols)for(const r of s.prices)if(r.date>u.calendar.at(-1))r.close*=100;
 const b=E.simulatePortfolio(v,config);A.deepEqual(a.trades,b.trades.filter(t=>t.exitDate<=u.calendar.at(-1)));A.deepEqual(a.signals.filter(s=>s.executionDate),b.signals.filter(s=>s.signalDate<u.calendar.at(-1)));
});
test('block bootstrap reproducible, Holm monotone, paired dates enforced',()=>{
 const d=Array.from({length:150},(_,i)=>Math.sin(i)*.001);A.deepEqual(S.bootstrap(d,{iterations:200}),S.bootstrap(d,{iterations:200}));A.deepEqual(S.holm([.01,.04,.03]),[.03,.06,.06]);A.equal(S.bootstrap([.1]).status,'INSUFFICIENT_DATES');A.throws(()=>S.pairedReturns([{date:'a',equity:1}],[{date:'b',equity:1}]));
});
test('split and dividend entitlements conserve equity without double counting',()=>{
 const u=fixture(135,1),stock=u.symbols[0],original=stock.prices[121].open;
 stock.corporate_actions=[{type:'split',date:u.calendar[122],ratio:2},{type:'dividend',ex_date:u.calendar[123],paid_date:u.calendar[130],amount_per_share:1}];
 for(let i=122;i<stock.prices.length;i++){stock.prices[i].open/=2;stock.prices[i].close/=2;if(i>=123){stock.prices[i].open-=1;stock.prices[i].close-=1;}}
 const r=E.simulatePortfolio(u,config),t=r.trades[0];A.ok(t);A.equal(t.dividend_earned,t.units);A.equal(t.units,r.events.find(e=>e.side==='BUY').units*2);
 A.equal(t.totalProceedsIncludingDividends,t.proceeds+t.dividend_earned);
 for(const l of r.ledger){const expected=l.available_cash+l.pending_sale_proceeds+l.dividend_receivables+l.positions.reduce((s,e)=>s+e.units*e.mark,0);A.ok(Math.abs(expected-l.equity)<1e-6);}
 const afterExit=r.ledger.find(l=>l.date===u.calendar[125]);A.ok(afterExit.dividend_receivables>0);
 A.equal(r.ledger.find(l=>l.date===u.calendar[130]).dividend_receivables,0);
 const event=E.eventStudy(u,config).events.find(e=>e.status==='CLOSED');A.ok(Math.abs(event.netReturn-t.return)<1e-12);
});
