'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,n=2)=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const pct=v=>v===null||v===undefined?'—':fmt(v*100)+'%';
const money=v=>fmt(v,0);
let strategy='vix',currentData=SAMPLE,lastResult=null,catalog=[],report=null,rawChip=null,catalogLimit=40,requestId=0,imported=false,taxManual=false;
const DATA_ROOT='./';
const cache=new Map([['SPY',SAMPLE]]);
const isFile=location.protocol==='file:';
const isLocal=['localhost','127.0.0.1','0.0.0.0'].includes(location.hostname);
function status(message,error=false){$('status').textContent=message;$('status').className=error?'error':'';}
function options(){return {capital:+$('capital').value,fee:+$('fee').value/100,slip:+$('slip').value/100,tax:strategy==='vix'?0:+$('tax').value/100,buy:+$('buy').value,sell:+$('sell').value,start:$('start').value,end:$('end').value};}
function metric(items){$('metrics').innerHTML=items.map(([label,value,color='',detail=''])=>`<div class="metric"><span>${esc(label)}</span><strong class="${color}">${esc(value)}</strong><small>${esc(detail)}</small></div>`).join('');}
function notice(text){$('notice').hidden=!text;$('notice').textContent=text;}
function chart(target,rows,series,{events=[],levels=[],height=235}={}){
 if(!rows.length){$(target).textContent='此期間資料不足';return;}
 const W=1000,H=height,L=67,R=20,T=22,B=32,dates=rows.map(r=>r.date);
 const vals=series.flatMap(s=>rows.map(r=>r[s.key])).filter(v=>Number.isFinite(v));vals.push(...levels.map(l=>l.value));
 if(!vals.length){$(target).textContent='指標尚未完成暖機';return;}
 let lo=Math.min(...vals),hi=Math.max(...vals),padding=(hi-lo)*.13||1;lo-=padding;hi+=padding;
 const x=i=>L+i/Math.max(1,rows.length-1)*(W-L-R),y=v=>T+(hi-v)/(hi-lo)*(H-T-B);
 let svg=`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc($(target).parentElement.querySelector('h3')?.textContent||target)}"><title>${esc(series.map(s=>s.label).join('、'))}</title>`;
 for(let i=0;i<4;i++){const v=lo+(hi-lo)*i/3;svg+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L-9}" y="${y(v)+4}" text-anchor="end">${fmt(v,hi>2000?0:1)}</text>`;}
 for(let i=0;i<5;i++){const j=Math.round((rows.length-1)*i/4);svg+=`<text x="${x(j)}" y="${H-6}" text-anchor="middle">${dates[j]}</text>`;}
 for(const l of levels)svg+=`<line x1="${L}" x2="${W-R}" y1="${y(l.value)}" y2="${y(l.value)}" stroke="${l.color}" stroke-dasharray="4 5" opacity=".6"/>`;
 for(const s of series){let d='',gap=true;rows.forEach((r,i)=>{if(!Number.isFinite(r[s.key])){gap=true;return;}d+=`${gap?'M':'L'}${x(i).toFixed(2)},${y(r[s.key]).toFixed(2)} `;gap=false;});svg+=`<path class="line" stroke="${s.color}" d="${d}"/>`;}
 const stride=Math.max(1,Math.floor(rows.length/1800));
 rows.forEach((r,i)=>{if(i%stride)return;svg+=`<rect x="${x(i)-2}" y="${T}" width="${Math.max(4,(W-L-R)/rows.length*stride)}" height="${H-T-B}" fill="transparent"><title>${esc(r.date+' | '+series.map(s=>s.label+': '+fmt(r[s.key])).join(' | '))}</title></rect>`;});
 for(const e of events){const i=dates.indexOf(e.date);if(i<0||!Number.isFinite(rows[i].close))continue;const px=x(i),py=y(rows[i].close),buy=e.side==='BUY';svg+=`<path d="M ${px} ${py} l -5 ${buy?11:-11} h 10 Z" fill="${buy?'#76e2bd':'#ff999f'}" stroke="#0b111b"><title>${esc((buy?'模擬買入':'模擬賣出')+' '+e.date+' | 訊號 '+e.signalDate+' | 成交 '+fmt(e.price))}</title></path>`;}
 $(target).innerHTML=svg+'</svg>';
}
function validatePrice(d,requireVix=false){
 if(!d||typeof d.symbol!=='string'||d.symbol.length>24)throw Error('股價資料須有有效股票代號');ResearchCore.validateRows(d.prices);
 if(requireVix&&(!Array.isArray(d.vix)||!d.vix.length))throw Error('VIX 模式需附帶 VIX 歷史序列');
 if(d.vix){let last='';for(const r of d.vix){if(!ResearchCore.validDate(r.date)||r.date<=last||!Number.isFinite(r.close)||r.close<=0)throw Error('VIX 日期或指數無效');last=r.date;}}
}
function resolveSymbol(){
 const text=$('symbolSearch').value.trim(),q=text.toLowerCase();
 const exact=catalog.find(c=>[c.provider_symbol,c.symbol,c.name_zh,c.name_en].some(v=>v?.toLowerCase()===q));
 if(exact)return exact.provider_symbol;
 let symbol=text.toUpperCase();if(/^\d+$/.test(symbol))symbol=catalog.find(c=>c.provider_symbol===symbol+'.TW')?.provider_symbol||catalog.find(c=>c.provider_symbol===symbol+'.TWO')?.provider_symbol||symbol+'.TW';
 if(!/^[A-Z0-9.^=-]{1,24}$/.test(symbol))throw Error('請從建議清單選擇公司，或輸入有效代號');return symbol;
}
function updateSuggestions(){
 const q=$('symbolSearch').value.trim().toLowerCase(),market=$('market').value;
 const found=catalog.filter(c=>(market==='all'||c.market===market)&&(!q||[c.provider_symbol,c.name_zh,c.name_en].some(v=>v?.toLowerCase().includes(q)))).slice(0,30);
 $('suggestions').innerHTML=found.map(c=>`<option value="${esc(c.provider_symbol)}" label="${esc(c.name_zh||c.name_en)} · ${esc(c.exchange)} · ${c.has_snapshot?'有快照':'尚無快照'}"></option>`).join('');
}
function updateUrl(){
 if(isFile)return;const params=new URLSearchParams({strategy,symbol:currentData?.symbol||'SPY',start:$('start').value,end:$('end').value});
 try{history.replaceState(null,'','?'+params);}catch{}
}
function setStrategy(next,render=true){
 strategy=next;if(next==='bb'&&!taxManual)$('tax').value=currentData?.currency==='TWD'?'0.3':'0';document.querySelectorAll('[data-strategy]').forEach(b=>{const active=b.dataset.strategy===next;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
 $('workspace').setAttribute('aria-labelledby','tab-'+next);$('workspace').classList.toggle('data-layout',next==='data');
 const chip=next==='chip',data=next==='data';
 for(const id of ['marketControls','dateControls','moneyControls'])$(id).hidden=chip;
 $('vixControls').hidden=next!=='vix';$('bbControls').hidden=next!=='bb';$('chipControls').hidden=!chip;$('taxControl').hidden=next!=='bb';
 $('metrics').hidden=data;$('results').hidden=data;$('dataCenter').hidden=!data;$('signalCard').hidden=true;$('notice').hidden=true;
 $('run').innerHTML=chip?'查看研究結果 <span>↗</span>':'執行回測 <span>↗</span>';
 $('explainText').textContent=next==='bb'?'已完成日線計算布林三軌，收盤確認後才在後續開盤模擬成交。回到中軌是出場條件，並不保證獲利。':chip?'比較法人流向、融資餘額與價格趨勢。歷史彙總以資料代理假設計算，尚未達到可採用訊號的證據門檻。':'使用日期早於股票交易日的最新 VIX，開盤模擬成交。原始 VIX 引擎與門檻定義保留。';
 if(render){if(data)renderCatalog();else if(chip)renderChip().catch(e=>{status(e.message,true);notice('研究報表暫時無法讀取；可匯入自己的資料包進行本機研究。');});else try{renderPrice();}catch(e){status(e.message,true);}}
 updateUrl();
}
function renderPrice(){
 validatePrice(currentData,strategy==='vix');const opt=options();
 if(opt.start>=opt.end)throw Error('結束日期必須晚於開始日期');
 const filtered=currentData.prices.filter(r=>r.date>=opt.start&&r.date<=opt.end);if(filtered.length<2)throw Error('所選日期範圍有效行情不足兩筆');
 let r,rows;
 if(strategy==='bb'){r=BbEngine.run(currentData.prices,{...opt,period:+$('period').value,k:+$('multiplier').value,mode:$('bbMode').value,calendar:currentData.calendar});rows=r.rows;}
 else{rows=VixEngine.align({...currentData,prices:filtered});r=VixEngine.run(rows,opt);}
 lastResult={...r,strategy,symbol:currentData.symbol,configuration:opt};
 $('heading').textContent=currentData.symbol+' · '+(currentData.name||'歷史研究');$('range').textContent=rows[0].date+' → '+rows.at(-1).date+' · '+rows.length+' 日';
 $('resultEyebrow').textContent=strategy==='bb'?'BOLLINGER BANDS / PRICE STRUCTURE':'VIX / MARKET VOLATILITY';
 const details=['單標的全額配置，允許零碎股；未模擬開盤漲跌停、委託排隊及交易容量。','Yahoo 拆股調整日線，不含現金股利再投入。使用標的原幣計價、不換匯。','期末持倉按最後收盤估值，未扣假設平倉成本；勝率只計完成交易。','全期間結果屬歷史樣本內研究，未證明具有未來優勢。'];
 if(strategy==='vix')details.push('VIX 使用日期嚴格早於股票交易日的最新收盤值；超過七個日曆日不新增交易。原版統一單邊費用未另外建模證交稅。');
 else details.push('母體標準差 ddof=0，N 期暖機；訊號於收盤確認、最早下一交易日開盤執行。最後一日無次日行情時，訊號保留待執行。','買賣手續費各扣一次，賣出另扣設定交易稅；最低手續費與整張限制未在單股布林模型啟用。');
 notice((currentData.currency==='TWD'?'台股 ':'')+'日線近似模型 · '+(strategy==='vix'?'統一費率未單列證交稅；':'已套用設定的賣出交易稅；')+'未模擬整股與漲跌停成交限制。');
 const last=rows.at(-1),lastSignal=r.signals?.filter(s=>s.date===last.date).at(-1);
 $('signalCard').hidden=strategy!=='bb';
 if(strategy==='bb'){
  const state=last.mid===null?'暖機資料不足':lastSignal?(lastSignal.side==='BUY'?'買入觀察':'賣出觀察'):'無新訊號';
  $('signalCard').innerHTML=`<div><div class="section-label">LATEST COMPLETED SESSION · ${esc(last.date)}</div><h3>${state}${lastSignal?' · 待後續開盤執行':''}</h3><p>${$('bbMode').value==='reversion'?'價格重回下軌後觀察買入，回到中軌出場。':'價格突破上軌後觀察買入，收盤跌破中軌出場。'}</p></div><small>上軌 ${fmt(last.upper)}<br>中軌 ${fmt(last.mid)}<br>下軌 ${fmt(last.lower)}</small>`;
 }
 metric([['策略累積報酬',pct(r.total),'green','期末 '+money(r.end)+' '+(currentData.currency||'')],['買入持有',pct(r.baseline),'blue','相對差異 '+pct(r.total-r.baseline)],['最大回撤',pct(r.mdd),'red','每日收盤估值'],['年化報酬',pct(r.cagr),'','持倉比例 '+pct(r.exposure)],['已完成交易',String(r.trades.length),'','期末未平倉 '+(r.entry?1:0)+' 筆'],['完成交易勝率',pct(r.winRate),'','只計已平倉部位'],[strategy==='bb'?'週期 / 標準差倍數':'VIX 買入 / 賣出',strategy==='bb'?$('period').value+' / '+$('multiplier').value:opt.buy+' / '+opt.sell,'',strategy==='bb'?($('bbMode').value==='reversion'?'下軌回歸':'趨勢突破'):'以已知的前期收盤值判斷'],['單邊手續費 / 滑價',pct(opt.fee)+' / '+pct(opt.slip),'',strategy==='bb'?'另扣賣出稅 '+pct(opt.tax):'原版統一費用模型']]);
 $('pricePanel').hidden=false;$('indicatorPanel').hidden=strategy==='bb';$('heatmapPanel').hidden=strategy!=='vix';$('researchPanel').hidden=true;$('tradePanel').hidden=false;
 $('priceTitle').textContent=strategy==='bb'?'價格通道與實際成交':'價格與實際成交';
 const series=[{key:'close',color:'#8cbaff',label:'收盤價'}];if(strategy==='bb')series.push({key:'upper',color:'#7e93ba',label:'上軌'},{key:'mid',color:'#e8be7d',label:'中軌'},{key:'lower',color:'#76bca6',label:'下軌'});
 $('priceLegend').innerHTML=strategy==='bb'?'━ 股價　<span class="amber">━ 中軌</span>　上下軌　▲ / ▼ 成交':'━ 股價　<span class="green">▲ 買入</span>　<span class="red">▼ 賣出</span>';
 chart('priceChart',rows,series,{events:r.events,height:290});
 if(strategy==='vix')chart('indicatorChart',rows,[{key:'vix',color:'#e8be7d',label:'可用 VIX'}],{levels:[{value:opt.buy,color:'#76e2bd'},{value:opt.sell,color:'#ff999f'}],height:175});
 $('equityLegend').innerHTML='<span class="green">━ 策略</span>　<span class="blue">━ 買入持有</span>';
 chart('equityChart',r.curve,[{key:'equity',color:'#76e2bd',label:'策略資產'},{key:'baseline',color:'#8cbaff',label:'買入持有'}],{height:230});
 $('position').textContent=r.entry?'期末仍持倉：'+r.entry.date+' 進場；按最後收盤估值，未計假設平倉成本。':'期末持有現金。';
 renderTrades(r.trades);
 if(strategy==='vix')renderHeatmap(rows,opt);
 $('assumptions').innerHTML='<ul>'+details.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>';
 $('sourceInfo').textContent=(currentData.source||'使用者匯入')+' · 取得 '+(currentData.fetchedAt||'未提供')+' · '+(currentData.price_adjustment||'還原口徑未提供');
 $('results').hidden=false;$('empty').hidden=true;status('回測完成 · '+rows.length+' 筆有效日線 · '+r.events.length+' 次模擬成交'+(imported?' · 本機匯入資料':' · 歷史快照'));updateUrl();
}
function renderTrades(trades){
 $('tradeHead').innerHTML='<tr><th>代號</th><th>訊號日</th><th>買入成交日</th><th>賣出成交日</th><th>買入價</th><th>賣出價</th><th>淨損益</th><th>報酬</th></tr>';
 $('trades').innerHTML=trades.length?trades.slice(-500).map(t=>`<tr><td>${esc(t.symbol||currentData?.symbol)}</td><td>${esc(t.signalDate)}</td><td>${esc(t.date)}</td><td>${esc(t.exitDate)}</td><td>${fmt(t.price)}</td><td>${fmt(t.exitPrice)}</td><td class="${t.pnl>=0?'green':'red'}">${fmt(t.pnl)}</td><td>${pct(t.return)}</td></tr>`).join(''):'<tr><td colspan="8">此期間沒有已完成交易；期末未平倉不計入勝率。</td></tr>';
}
function renderHeatmap(rows,opt){
 const buys=[20,25,30,35,40,45],sells=[12,15,18,20,25];let html='<table class="map"><thead><tr><th>買入 ↓ / 賣出 →</th>'+sells.map(v=>'<th>'+v+'</th>').join('')+'</tr></thead><tbody>';
 for(const buy of buys){html+='<tr><th>'+buy+'</th>';for(const sell of sells){if(buy<=sell){html+='<td>—</td>';continue;}const r=VixEngine.run(rows,{...opt,buy,sell});html+=`<td><button type="button" data-buy="${buy}" data-sell="${sell}" style="background:rgba(${r.total>=0?'40,139,108':'175,73,88'},${Math.min(.65,.1+Math.abs(r.total)*.25)})" title="${r.trades.length} 筆交易 / 回撤 ${pct(r.mdd)}">${pct(r.total)}</button></td>`;}html+='</tr>';}
 $('heatmap').innerHTML=html+'</tbody></table>';
 $('heatmap').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('buy').value=b.dataset.buy;$('sell').value=b.dataset.sell;renderPrice();});
}
async function loadPrice(e){
 e?.preventDefault();if(strategy==='chip'){await renderChip();return;}if(strategy==='data')return;
 const token=++requestId;$('run').disabled=true;
 try{
  const symbol=resolveSymbol();if($('start').value>=$('end').value)throw Error('日期範圍無效');status('讀取 '+symbol+' 歷史行情…');
  if(imported&&currentData?.symbol===symbol){renderPrice();return;}
  let d=cache.get(symbol);if(!d){
   if(isFile)throw Error('離線模式請匯入此代號的歷史 JSON');
   const entry=catalog.find(c=>c.provider_symbol===symbol);let endpoint=entry?.snapshot_path?'./'+entry.snapshot_path:'./data/stocks/'+encodeURIComponent(symbol)+'.json';
   let response=await fetch(endpoint,{signal:AbortSignal.timeout(45000)});
   if(!response.ok&&isLocal){const query=new URLSearchParams({symbol,start:'2020-01-01',end:$('end').value});response=await fetch('/api/data?'+query,{signal:AbortSignal.timeout(60000)});}
   if(!response.ok)throw Error('此代號尚無歷史快照。可匯入 JSON，或由儲存庫管理者新增行情。');
   d=await response.json();if(d.error)throw Error(d.error);
   if(!d.vix){const v=await fetch('./data/vix.json').then(r=>{if(!r.ok)throw Error('共用 VIX 讀取失敗');return r.json();});d.vix=v.vix;}
   validatePrice(d,true);cache.set(symbol,d);
  }
  if(token!==requestId)return;
  currentData=d;imported=false;$('symbolSearch').value=symbol;
  if(strategy==='bb'&&!taxManual)$('tax').value=d.currency==='TWD'?'0.3':'0';
  if(strategy==='vix'||strategy==='bb')renderPrice();
 }catch(error){status(error.message||'資料取得失敗',true);notice('本次條件未完成計算。下方若有結果，仍是上次成功的研究；請修正設定後重新執行。');}
 finally{if(token===requestId)$('run').disabled=false;}
}
function updateHolding(){const id=$('chipStrategy').value,selected=+$('holding').value,hs=ChipEngine.horizons[id];$('holding').innerHTML=hs.map(h=>`<option value="${h}" ${h===(hs.includes(selected)?selected:hs[1])?'selected':''}>${h} 日</option>`).join('');const allow=id==='S2'&&+$('holding').value===5;$('ranking').disabled=!allow;if(!allow)$('ranking').value='symbol';}
async function renderChip(){
 if(strategy!=='chip')return;
 status('準備籌碼研究…');
 let selected,metrics,curve,trades=[],comparison=null;
 if(rawChip){
  const opts={strategy:$('chipStrategy').value,holding:+$('holding').value,ranking:$('ranking').value,availability:rawChip.availability_basis==='proxy'?'proxy':'strict',execution:'strict',capital:1000000,fee:.001425,tax:.003,slip:.0005,minFee:20,lot:1000};
  selected=ChipEngine.simulatePortfolio(rawChip,opts);metrics={...selected,completed:selected.trades.length,pending:selected.positions.length,signals:selected.signals.length,rejected:selected.orderEvents.filter(e=>e.status==='CANCELLED').length};curve=selected.curve;trades=selected.trades;
  lastResult={...selected,strategy:'chip',manifest:{spec_version:'1.3',configuration:opts},source:'local import'};
 }else{
  if(!report){const response=await fetch('./data/chip_report.json');if(!response.ok)throw Error('籌碼研究報表尚未建立');report=await response.json();}
  if(strategy!=='chip')return;
  const id=$('chipStrategy').value+'-h'+$('holding').value,baseline=report.runs.find(r=>r.id===id);
  selected=$('ranking').value==='R1'?report.ranking:baseline;if(!selected)throw Error('此研究組合尚無報表');metrics=selected.metrics;curve=selected.curve;
  if($('ranking').value==='R1')comparison=baseline.curve;
  lastResult={...selected,strategy:'chip',manifest:report.manifest,limitations:report.limitations};
 }
 $('heading').textContent=$('ranking').value==='R1'?'R1 · 相同 S2 候選排序':$('chipStrategy').value+' · '+$('holding').value+' 日籌碼研究';
 $('resultEyebrow').textContent='INSTITUTIONAL FLOW / EXPLORATORY RESEARCH';
 $('range').textContent=(curve[0]?.date||'—')+' → '+(curve.at(-1)?.date||'—');
 notice(rawChip?'本機研究 · 嚴格成交證據模式；缺少可交易狀態與漲跌停證據的訂單不成交。':'六檔代理研究 · 無歷史原始公布版本、未重建完整公司行為與漲跌停條件；結果不能當作可採用交易訊號。');
 const reasons={S1:'當日法人淨買入占量至少 5%、相對前 60 日異常強度達 1.5、量比至少 1.2，且收盤上漲。',S2:'5 日法人淨買入占量至少 3%、投信至少 3 日買超、融資未增加，且收盤高於 20 日線。',S3:'20 日法人淨買入占量至少 2%、投信至少 10 日買超，且價格及均線維持中期上升趨勢。'};
 $('signalCard').hidden=false;$('signalCard').innerHTML='<div><div class="section-label">RESEARCH STATUS</div><h3>研究假設已定義，策略證據尚待補齊</h3><p>'+esc(reasons[$('chipStrategy').value])+'</p><p>'+esc(rawChip?'本機匯入 '+rawChip.symbols.length+' 檔；原始資料不會上傳。':'上市 3 檔＋上櫃 3 檔。完整比較九組持有期與成本情境。')+'</p><div class="chip-badges"><span>歷史版本待驗證</span><span>母體覆蓋有限</span><span>尚未採用</span></div></div>';
 metric([['組合累積報酬',pct(metrics.total),'green','初始資金 NT$1,000,000'],['年化報酬',pct(metrics.cagr),'','日線代理假設'],['最大回撤',pct(metrics.mdd),'red','每日收盤資產'],['已完成交易',String(metrics.completed),'','期末部位 '+(metrics.pending??0)+' 檔'],['完成交易勝率',pct(metrics.winRate),'','只計已平倉部位'],['候選訊號',String(metrics.signals),'','相同資格再做排序'],['買單拒絕',String(metrics.rejected??0),'','未成交不即時替補'],['夏普比率',fmt(metrics.sharpe),'','252 日 / 無風險利率 0']]);
 $('pricePanel').hidden=true;$('indicatorPanel').hidden=true;$('heatmapPanel').hidden=true;$('researchPanel').hidden=!!rawChip;$('tradePanel').hidden=!rawChip;
 const plotted=curve.map((r,i)=>({...r,comparison:comparison?.[i]?.equity??null}));
 chart('equityChart',plotted,[{key:'equity',color:'#76e2bd',label:'策略資產'},...(comparison?[{key:'comparison',color:'#8cbaff',label:'同候選固定排序'}]:[])],{height:260});
 $('equityLegend').innerHTML='<span class="green">━ 研究組合</span>'+(comparison?'　<span class="blue">━ 相同候選固定排序</span>':'');
 $('position').textContent='五檔上限 / 單檔 20% / 同產業 40% / 整張交易 / 買賣手續費 0.1425% / 賣出稅 0.3% / 單邊滑價 0.05%。賣款次一市場交易日才可再用。';
 if(!rawChip){
  $('baselineGrid').innerHTML=report.runs.map(r=>`<button type="button" data-chip-run="${r.id}" class="${r.id===$('chipStrategy').value+'-h'+$('holding').value?'active':''}"><span>${r.strategy} · ${r.holding} 交易日</span><strong class="${r.metrics.total>=0?'green':'red'}">${pct(r.metrics.total)}</strong><small>${r.metrics.completed} 筆完成 · 回撤 ${pct(r.metrics.mdd)}</small></button>`).join('');
  document.querySelectorAll('[data-chip-run]').forEach(b=>b.onclick=()=>{const r=report.runs.find(r=>r.id===b.dataset.chipRun);$('chipStrategy').value=r.strategy;updateHolding();$('holding').value=r.holding;$('ranking').value='symbol';updateHolding();renderChip().catch(e=>status(e.message,true));});
  const stats=report.ranking.statistics?.[0],sensitivity=selected.sensitivity;
  $('statistics').innerHTML=$('ranking').value==='R1'?'<p>R1 與同候選固定排序的每日淨報酬配對差：'+pct(stats?.mean)+'；95% 區間 '+(stats?.ci?stats.ci.map(pct).join(' ～ '):'樣本不足')+'。整日截面時間區塊重抽樣，區塊 30 日、5,000 次。此結果僅作探索，未通過採用門檻。</p>':`<p>單筆事件研究：${selected.eventStudy?.completed??0} 筆完成 / ${selected.eventStudy?.signalDates??0} 個訊號日，平均扣成本報酬 ${pct(selected.eventStudy?.mean)}。事件可重疊，這不是可投入資金的組合報酬。</p>`;
  if(sensitivity)$('statistics').innerHTML+='<p>敏感度 · 單邊滑價 0.15%：'+pct(sensitivity['slip_0.0015']?.total)+' ／0.30%：'+pct(sensitivity['slip_0.003']?.total)+' ／T+2 進場：'+pct(sensitivity.delay2?.total)+'</p>';
 }
 if(rawChip)renderTrades(trades);
 $('assumptions').innerHTML='<ul><li>原始 S1／S2／S3 門檻保留，分別比較 1/2/3、3/5/10、10/20/30 日。持有期自實際進場日起按市場交易日計算。</li><li>原始研究資料來自 FinMind；原資料機關 TWSE／TPEx。公開報表僅含分析彙總，原始觀測不公開再散布。<a href="https://finmind.github.io/Disclaimer/" target="_blank" rel="noopener">資料授權說明 ↗</a></li><li>缺歷史公布證據、開盤限制及完整公司行為資訊，歷史代理結果不等於嚴格可交易回測。T+2 並不能消除修訂偏差。</li><li>六檔現存股票僅驗證資料流程，不能推廣成全市場結論。歷史留出也不自動等於未接觸的樣本外。</li><li>買單失敗取消，賣單受阻保留部位；固定產業與資金限制，未平倉與截尾事件另記。</li></ul>';
 $('sourceInfo').textContent=rawChip?'使用者本機匯入 · 原始資料不會上傳':'彙總產生 '+report.published_at+' · 資料雜湊 '+report.manifest.dataset_hash.slice(0,12)+' · 六檔清單：'+report.manifest.universe.map(s=>s.symbol).join(' / ');
 $('results').hidden=false;status(rawChip?'本機籌碼研究計算完成':'已載入實際歷史代理研究 · 尚未通過策略採用驗證');
}
function renderCatalog(){
 const q=$('catalogQuery').value.trim().toLowerCase(),filter=$('catalogFilter').value;
 const found=catalog.filter(c=>(filter==='all'||filter==='snapshots'&&c.has_snapshot||filter===c.market)&&(!q||[c.provider_symbol,c.symbol,c.name_zh,c.name_en].some(v=>v?.toLowerCase().includes(q))));
 $('heading').textContent='資料中心 · 來源清楚，狀態透明';$('resultEyebrow').textContent='DATA COVERAGE / QUALITY';$('range').textContent=catalog.length.toLocaleString()+' 筆目錄';$('catalogCount').textContent=found.length.toLocaleString()+' 筆符合';
 $('catalogRows').innerHTML=found.slice(0,catalogLimit).map(c=>`<tr><td><button class="catalog-button" data-catalog-symbol="${esc(c.provider_symbol)}">${esc(c.provider_symbol)}</button><div class="hint">${esc(c.exchange)} · ${esc(c.currency)}</div></td><td title="${esc(c.name_en)}">${esc((c.name_zh||c.name_en).slice(0,50))}</td><td>${esc(c.instrument_type)}</td><td>${esc(c.last_price_date||'—')}</td><td>${c.has_snapshot?'<span class="status-dot"></span>可回測':'僅目錄 · 尚無快照'}</td></tr>`).join('')||'<tr><td colspan="5">沒有符合條件的證券。</td></tr>';
 $('moreCatalog').hidden=found.length<=catalogLimit;
 document.querySelectorAll('[data-catalog-symbol]').forEach(b=>b.onclick=()=>{$('symbolSearch').value=b.dataset.catalogSymbol;setStrategy('bb',false);loadPrice();});
}
async function loadCatalog(){
 if(isFile)return;
 try{
  const response=await fetch('./data/symbol_catalog.json');if(!response.ok)throw Error('目錄讀取失敗');const data=await response.json();catalog=data.symbols;
  const available=catalog.filter(c=>c.has_snapshot),tw=available.filter(c=>c.market==='TW').length,us=available.filter(c=>c.market==='US').length;
  $('snapshotCount').textContent=available.length;$('snapshotAsOf').textContent='台股 '+tw+' · 美股 '+us;updateSuggestions();
  $('dataHealth').innerHTML='<p>可搜尋 '+catalog.length.toLocaleString()+' 筆證券；已有 '+available.length+' 檔快照（台股 '+tw+'／美股 '+us+'）。</p><p>目錄更新：'+esc(data.updated_at)+'。台股來源 TWSE／TPEx 公司基本資料；美股來源 Nasdaq Trader。</p>';
  try{const checks=await fetch('./data/source_checks.json').then(r=>r.json());$('dataHealth').innerHTML+='<p>籌碼資料：'+checks.checks.length+' 檔完成歷史抓取；歷史版本、下市母體、公司行為與開盤成交限制尚待補齊。原始籌碼觀測保留於私人儲存。</p>';}catch{}
  if(strategy==='data')renderCatalog();
 }catch(e){$('snapshotAsOf').textContent='目錄暫時無法讀取';$('dataHealth').textContent=e.message;}
}
function download(text,name,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob(['\ufeff'+text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const csvCell=value=>{let s=String(value??'');if(typeof value==='string'&&/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
$('form').onsubmit=e=>{e.preventDefault();Promise.resolve(loadPrice()).catch(e=>status(e.message,true));};
$('symbolSearch').oninput=updateSuggestions;
$('tax').oninput=()=>{taxManual=true;};
$('market').onchange=()=>{updateSuggestions();};
for(const id of ['chipStrategy','holding','ranking'])$(id).onchange=()=>{updateHolding();renderChip().catch(e=>status(e.message,true));};
document.querySelectorAll('[data-symbol]').forEach(b=>b.onclick=()=>{$('symbolSearch').value=b.dataset.symbol;loadPrice();});
document.querySelectorAll('[data-strategy]').forEach(b=>b.onclick=()=>setStrategy(b.dataset.strategy));
$('tab-vix').parentElement.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[data-strategy]')],i=tabs.findIndex(b=>b.dataset.strategy===strategy),n=e.key==='Home'?0:e.key==='End'?3:(i+(e.key==='ArrowRight'?1:3))%4;tabs[n].focus();setStrategy(tabs[n].dataset.strategy);};
$('exportTrades').onclick=()=>{if(!lastResult)return;const keys=['symbol','signalDate','date','exitDate','price','exitPrice','units','commission','exitCommission','tax','pnl','return'];download([keys.map(csvCell).join(','),...(lastResult.trades||[]).map(t=>keys.map(k=>csvCell(t[k]??(k==='symbol'?currentData?.symbol:''))).join(','))].join('\n'),strategy+'-trades.csv','text/csv;charset=utf-8');};
$('exportData').onclick=()=>{if(lastResult)download(JSON.stringify(strategy==='chip'?lastResult:{...currentData,research:{strategy,configuration:lastResult.configuration,signals:lastResult.signals||[],orderEvents:lastResult.orderEvents||[]}}),strategy+'-research.json','application/json');};
$('importFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>15e6)throw Error('股價 JSON 限 15 MB');const d=JSON.parse((await f.text()).replace(/^\uFEFF/,''));validatePrice(d,strategy==='vix');currentData=d;imported=true;$('symbolSearch').value=d.symbol;$('start').value=d.prices[0].date;$('end').value=d.prices.at(-1).date;if(strategy==='chip')setStrategy('bb',false);renderPrice();}catch(e){status(e.message,true);}};
$('chipFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>30e6)throw Error('籌碼 JSON 限 30 MB');const d=JSON.parse((await f.text()).replace(/^\uFEFF/,''));ChipEngine.validateUniverse(d);rawChip=d;$('chipModeHint').textContent='本機匯入 '+d.symbols.length+' 檔 · 嚴格成交證據模式 · 不上傳';await renderChip();}catch(e){status(e.message,true);}};
$('catalogQuery').oninput=()=>{catalogLimit=40;renderCatalog();};$('catalogFilter').onchange=()=>{catalogLimit=40;renderCatalog();};$('moreCatalog').onclick=()=>{catalogLimit+=60;renderCatalog();};
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());$('end').max=today;$('end').value=SAMPLE.prices.at(-1).date;
const query=new URLSearchParams(location.search),requested=query.get('strategy');
for(const key of ['start','end'])if(ResearchCore.validDate(query.get(key)))$(key).value=query.get(key);
if(query.get('symbol')&&/^[A-Z0-9.^=-]{1,24}$/.test(query.get('symbol').toUpperCase()))$('symbolSearch').value=query.get('symbol').toUpperCase();
try{setStrategy(['vix','bb','chip','data'].includes(requested)?requested:'vix',false);if(strategy==='vix'||strategy==='bb')renderPrice();else if(strategy==='chip')renderChip().catch(e=>status(e.message,true));else renderCatalog();}catch(e){status(e.message,true);}
loadCatalog().then(()=>{if(query.get('symbol')&&query.get('symbol').toUpperCase()!=='SPY'&&['vix','bb'].includes(strategy))loadPrice();});
