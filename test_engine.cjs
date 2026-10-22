const assert = require('node:assert/strict');
const {align, run} = require('./engine.js');
const data={prices:[
 {date:'2025-01-02',open:100,close:101},
 {date:'2025-01-03',open:110,close:115},
 {date:'2025-01-06',open:120,close:121}],
 vix:[{date:'2025-01-02',close:30},{date:'2025-01-03',close:10},{date:'2025-01-06',close:50}]};
const rows=align(data);
assert.equal(rows[0].vix,null); // Cannot use today's final VIX at today's open.
assert.equal(rows[1].signalDate,'2025-01-02');
assert.equal(rows[2].signalDate,'2025-01-03');
const o={capital:1000,buy:25,sell:15,fee:0,slip:0};
const r=run(rows,o);
assert.equal(r.events[0].date,'2025-01-03');
assert.equal(r.events[1].date,'2025-01-06');
assert.equal(r.trades.length,1);
assert.ok(Math.abs(r.end-1000/110*120)<1e-8);
assert.ok(run(rows,{...o,fee:.01,slip:.01}).end<r.end);
assert.equal(run(rows,{...o,buy:90}).total,0);
assert.equal(run(rows,{...o,buy:90}).winRate,null);
assert.equal(run(rows.slice(0,2),o).trades.length,0);
assert.ok(run(rows.slice(0,2),o).entry);
assert.equal(align({prices:[{date:'2025-02-01',open:1,close:1}],vix:data.vix})[0].vix,null);
assert.throws(()=>run(rows,{...o,buy:10,sell:15}));
console.log('PASS: timing, next-open execution, costs, no-trade, open position, stale VIX, validation');
