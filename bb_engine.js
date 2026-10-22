/* Bollinger signals use completed closes; orders execute at a later open. */
const BbEngine = (() => {
  const C=typeof module!=='undefined'?require('./research_core.js'):ResearchCore;
  function indicators(rows,n=20,k=2) {
    C.validateRows(rows);
    if(!Number.isInteger(n)||n<5||n>200||!C.finite(k)||k<.5||k>4)throw Error('布林週期限 5–200，倍數限 0.5–4');
    return rows.map((r,i)=>{if(i<n-1)return {...r,mid:null,upper:null,lower:null};const a=rows.slice(i-n+1,i+1).map(x=>x.close),mid=C.mean(a),s=C.std(a);return {...r,mid,upper:mid+k*s,lower:mid-k*s};});
  }
  function run(prices,options={}) {
    const p=C.costs({period:20,k:2,mode:'reversion',...options});
    if(!['reversion','breakout'].includes(p.mode))throw Error('未知布林模式');
    const all=indicators(prices,p.period,p.k),rows=all.filter(r=>(!p.start||r.date>=p.start)&&(!p.end||r.date<=p.end));
    if(rows.length<2)throw Error('所選期間有效行情不足');
    const byDate=new Map(all.map((r,i)=>[r.date,{r,previous:all[i-1]}]));
    const calendar=p.calendar??rows.map(r=>r.date),dates=calendar.filter(d=>d>=rows[0].date&&d<=rows.at(-1).date);
    if(dates.some((d,i)=>!C.validDate(d)||(i&&d<=dates[i-1])))throw Error('市場交易日曆無效');
    let cash=p.capital,entry=null,pending=null,exposure=0,lastClose=rows[0].open;
    const trades=[],events=[],signals=[],orderEvents=[],curve=[];
    const baseline=C.buy(p.capital,rows[0].open,p);
    for(let i=0;i<dates.length;i++) {
      const day=dates[i],v=byDate.get(day),r=v?.r,prev=v?.previous;
      if(pending){
        if(r){
          if(pending.side==='BUY'&&!entry){const fill=C.buy(cash,r.open,p);if(fill){cash-=fill.cost;entry={...fill,date:day,signalDate:pending.signalDate,index:i};events.push({side:'BUY',...entry,marketPrice:r.open});}else orderEvents.push({...pending,date:day,status:'REJECTED',reason:'INSUFFICIENT_CASH'});}
          if(pending.side==='SELL'&&entry){const fill=C.sell(entry.units,r.open,p);cash+=fill.proceeds;trades.push({...entry,exitDate:day,exitPrice:fill.price,exitCommission:fill.commission,tax:fill.tax,proceeds:fill.proceeds,pnl:fill.proceeds-entry.cost,return:fill.proceeds/entry.cost-1,holdingDays:i-entry.index});events.push({side:'SELL',date:day,price:fill.price,signalDate:pending.signalDate,marketPrice:r.open});entry=null;}
          pending=null;
        }else {orderEvents.push({...pending,date:day,status:pending.side==='BUY'?'CANCELLED':'BLOCKED',reason:'MISSING_OPEN'});if(pending.side==='BUY')pending=null;}
      }
      if(r)lastClose=r.close;
      if(entry)exposure++;
      curve.push({date:day,equity:cash+(entry?entry.units*lastClose:0),baseline:baseline?baseline.units*lastClose+(p.capital-baseline.cost):p.capital});
      if(!r||r.mid===null||!prev||prev.mid===null)continue;
      const enter=p.mode==='reversion'?prev.close<prev.lower&&r.close>=r.lower:prev.close<=prev.upper&&r.close>r.upper;
      const exit=p.mode==='reversion'?r.close>=r.mid:prev.close>=prev.mid&&r.close<r.mid;
      const side=!entry&&enter?'BUY':entry&&exit?'SELL':null;
      if(side){const s={date:day,signalDate:day,side,close:r.close,status:i===dates.length-1?'PENDING':'CONFIRMED'};signals.push(s);if(!pending)pending=s;}
    }
    return C.summary(curve,trades,p.capital,{rows,events,signals,orderEvents,entry,pending,exposure:exposure/dates.length,baseline:curve.at(-1).baseline/p.capital-1,model:'daily-open approximation; split-adjusted; cash dividends excluded'});
  }
  return {indicators,run};
})();
if(typeof module!=='undefined')module.exports=BbEngine;
