/* Shared pure backtest engine; also executable by Node for regression checks. */
const VixEngine = (() => {
  function align(data) {
    let j = -1;
    return data.prices.map(p => {
      while (j + 1 < data.vix.length && data.vix[j + 1].date < p.date) j++;
      const v = j >= 0 ? data.vix[j] : null;
      const age = v ? (Date.parse(p.date) - Date.parse(v.date)) / 86400000 : Infinity;
      return {...p, vix: age <= 7 ? v.close : null, signalDate: age <= 7 ? v.date : null};
    });
  }
  function run(rows, options) {
    const {capital, buy, sell, fee, slip} = options;
    if (!(capital > 0 && buy > sell && sell > 0 && fee >= 0 && fee < 1 && slip >= 0 && slip < 1)) throw Error('請確認資金、門檻及成本設定；買入 VIX 門檻必須高於賣出門檻。');
    if (rows.length < 2) throw Error('有效行情不足');
    let cash = capital, units = 0, entry = null, peak = capital, mdd = 0, exposure = 0;
    const trades = [], events = [], curve = [];
    const baseUnits = capital / (rows[0].open * (1 + slip) * (1 + fee));
    for (const r of rows) {
      if (r.vix !== null && !units && r.vix >= buy) {
        const price = r.open * (1 + slip), budget = cash;
        units = budget / (price * (1 + fee)); cash = 0;
        entry = {date: r.date, price, cost: budget, units, signalDate: r.signalDate, vix: r.vix};
        events.push({side:'BUY', ...entry, marketPrice:r.open});
      } else if (r.vix !== null && units && r.vix <= sell) {
        const price = r.open * (1 - slip);
        cash = units * price * (1 - fee);
        trades.push({...entry, exitDate:r.date, exitPrice:price, proceeds:cash, pnl:cash-entry.cost, return:cash/entry.cost-1});
        events.push({side:'SELL', date:r.date, price, marketPrice:r.open, vix:r.vix, signalDate:r.signalDate});
        units = 0; entry = null;
      }
      if (units) exposure++;
      const equity = cash + units * r.close;
      peak = Math.max(peak, equity); const drawdown = equity/peak-1;
      mdd = Math.min(mdd, drawdown);
      curve.push({date:r.date, equity, baseline:baseUnits*r.close, drawdown});
    }
    const last = curve.at(-1), years = (Date.parse(last.date)-Date.parse(curve[0].date))/86400000/365.25;
    return {trades, events, curve, entry, end:last.equity, total:last.equity/capital-1,
      baseline:last.baseline/capital-1, cagr: years > 0 ? (last.equity/capital)**(1/years)-1 : 0,
      mdd, exposure:exposure/rows.length, wins:trades.filter(t=>t.pnl>0).length,
      winRate:trades.length ? trades.filter(t=>t.pnl>0).length/trades.length : null};
  }
  return {align, run};
})();
if (typeof module !== 'undefined') module.exports = VixEngine;
