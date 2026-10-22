/* Pure research accounting shared by browser and Node. */
const ResearchCore = (() => {
  const finite = v => typeof v === 'number' && Number.isFinite(v);
  const mean = a => a.reduce((x,y)=>x+y,0)/a.length;
  const std = a => {const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};
  function validDate(s) { return typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s; }
  function validateRows(rows) {
    if (!Array.isArray(rows) || rows.length<2 || rows.length>30000) throw Error('有效日線須為 2–30,000 筆');
    let previous='';
    for (const r of rows) {
      if(!validDate(r.date)||r.date<=previous||!finite(r.open)||!finite(r.close)||r.open<=0||r.close<=0) throw Error('日線須依日期遞增、不重複，且價格有效');
      previous=r.date;
    }
  }
  function costs(o={}) {
    const p={capital:100000,fee:.001425,slip:.0005,tax:0,minFee:0,lot:0,...o};
    if(!finite(p.capital)||p.capital<=0||['fee','slip','tax'].some(k=>!finite(p[k])||p[k]<0||p[k]>=1)||!finite(p.minFee)||p.minFee<0||!finite(p.lot)||p.lot<0) throw Error('資金、費率、滑價或交易單位無效');
    return p;
  }
  function buy(budget,open,p,cap=Infinity) {
    const price=open*(1+p.slip);
    let units=Math.max(0,Math.min(cap,(budget-p.minFee)/price,budget/(price*(1+p.fee))));
    if(p.lot) units=Math.floor(units/p.lot)*p.lot;
    if(units<=0) return null;
    const commission=Math.max(p.minFee,units*price*p.fee),cost=units*price+commission;
    if(cost>budget+1e-7) return null;
    return {units,price,commission,cost,slippage_cost:units*open*p.slip};
  }
  function sell(units,open,p) {
    const price=open*(1-p.slip),commission=Math.max(p.minFee,units*price*p.fee),tax=units*price*p.tax;
    return {price,commission,tax,proceeds:units*price-commission-tax,slippage_cost:units*open*p.slip};
  }
  function summary(curve,trades,capital,extra={}) {
    let peak=capital,mdd=0;
    for(const r of curve){peak=Math.max(peak,r.equity);r.drawdown=r.equity/peak-1;mdd=Math.min(mdd,r.drawdown);}
    const end=curve.at(-1)?.equity??capital,years=curve.length>1?(Date.parse(curve.at(-1).date)-Date.parse(curve[0].date))/86400000/365.25:0;
    const returns=curve.slice(1).map((r,i)=>r.equity/curve[i].equity-1),sigma=returns.length?std(returns):0;
    const wins=trades.filter(t=>t.pnl>0).length,gain=trades.reduce((s,t)=>s+Math.max(0,t.pnl),0),loss=-trades.reduce((s,t)=>s+Math.min(0,t.pnl),0);
    return {curve,trades,end,total:end/capital-1,cagr:years>0?(end/capital)**(1/years)-1:0,mdd,wins,winRate:trades.length?wins/trades.length:null,sharpe:sigma>0?mean(returns)/sigma*Math.sqrt(252):null,profitFactor:loss?gain/loss:null,averageTrade:trades.length?mean(trades.map(t=>t.return)):null,averageHolding:trades.length?mean(trades.map(t=>t.holdingDays??0)):null,...extra};
  }
  function percentile(values) {
    const sorted=values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v),out=Array(values.length);
    for(let i=0;i<sorted.length;){let j=i+1;while(j<sorted.length&&sorted[j].v===sorted[i].v)j++;const rank=sorted.length===1?.5:((i+j-1)/2)/(sorted.length-1);for(let k=i;k<j;k++)out[sorted[k].i]=rank;i=j;}
    return out;
  }
  return {finite,mean,std,validDate,validateRows,costs,buy,sell,summary,percentile};
})();
if(typeof module!=='undefined')module.exports=ResearchCore;
