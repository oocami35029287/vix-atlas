'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(v,n=2)=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:n,maximumFractionDigits:n}):'—';
const pct=v=>v===null||v===undefined?'—':fmt(v*100)+'%';
const money=v=>fmt(v,0);
let strategy='vix',currentData=null,lastResult=null,catalog=[],rawChip=null,catalogLimit=40,requestId=0,imported=false,taxManual=false;
const DATA_ROOT='./';
const dataClient=AtlasData.createClient();
let catalogSnapshots=[];
let rawRev=null,loadedUniverse=null,rawAuto=null,screenResult=null,pendingSelection=null,scanAbort=null;
let stockSlots=['2330.TW','2317.TW','2454.TW'].map(symbol=>({symbol,name:symbol,market:'TW',industry:'unknown',locked:false,origin:'manual'}));
function dataRequest(dataset,symbol,start,end){return {dataset,symbol,start,end,mode:$('dataMode').value,as_of:$('dataMode').value==='historical_asof'?$('asOf').value+':00+08:00':'',currency:dataset.startsWith('Taiwan')?'TWD':'USD'};}
function availability(){return $('dataMode').value==='proxy'?'proxy':'strict';}
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
 $('suggestions').innerHTML=found.map(c=>`<option value="${esc(c.provider_symbol)}" label="${esc(c.name_zh||c.name_en)} · ${esc(c.exchange)} · 直接查詢"></option>`).join('');
}
function updateUrl(){
 if(isFile)return;const params=new URLSearchParams({strategy,symbol:currentData?.symbol||'SPY',start:$('start').value,end:$('end').value});
 try{history.replaceState(null,'','?'+params);}catch{}
}
function setStrategy(next,render=true){
 strategy=next;if(next==='bb'&&!taxManual)$('tax').value=currentData?.currency==='TWD'?'0.3':'0';document.querySelectorAll('[data-strategy]').forEach(b=>{const active=b.dataset.strategy===next;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
 $('workspace').setAttribute('aria-labelledby','tab-'+next);$('workspace').classList.toggle('data-layout',next==='data');
 if(strategy!=='auto'&&scanAbort)scanAbort.abort();const chip=next==='chip',rev=next==='rev',auto=next==='auto',research=chip||rev||auto,data=next==='data';
 for(const id of ['marketControls','moneyControls'])$(id).hidden=research;$('dateControls').hidden=false;
 $('vixControls').hidden=next!=='vix';$('bbControls').hidden=next!=='bb';$('chipControls').hidden=!chip;$('revControls').hidden=!rev;$('universeControls').hidden=!research;$('autoControls').hidden=!auto;$('autoPanel').hidden=!auto;$('dateControls').hidden=auto;$('executionMode').parentElement.querySelector('label[for=executionMode]').hidden=auto;$('executionMode').hidden=auto;$('taxControl').hidden=next!=='bb';
 $('metrics').hidden=data||auto;$('results').hidden=data||auto;$('empty').hidden=auto;$('dataCenter').hidden=!data;$('signalCard').hidden=true;$('notice').hidden=true;
 $('run').innerHTML=auto?'掃描並預覽推薦 <span>↗</span>':research?'執行研究 <span>↗</span>':'執行回測 <span>↗</span>';
 $('explainText').textContent=next==='bb'?'已完成日線計算布林三軌，收盤確認後才在後續開盤模擬成交。回到中軌是出場條件，並不保證獲利。':rev?'營收異常、當時已公布的營益率與價格突破共同產生候選，配置前固定母體與資料版本。':auto?'在固定觀察池依品質、營收事件、技術與法人資料逐層篩選。先預覽，再確認填入；不是全市場最佳名單。':chip?'比較法人流向、融資餘額與價格趨勢。歷史彙總以資料代理假設計算，尚未達到可採用訊號的證據門檻。':'使用日期早於股票交易日的最新 VIX，開盤模擬成交。原始 VIX 引擎與門檻定義保留。';
 if(render){if(data)renderCatalog();else if(auto){$('heading').textContent='有界候選池 · 自動選股研究';$('resultEyebrow').textContent='QUALITY / REVENUE / BREAKOUT / FLOW';$('results').hidden=true;$('empty').hidden=true;}else if(rev)showResearchEmpty();else if(chip)renderChip().catch(e=>{status(e.message,true);notice('研究報表暫時無法讀取；可匯入自己的資料包進行本機研究。');});else try{if(currentData)renderPrice();else showResearchEmpty();}catch(e){status(e.message,true);}}
 updateUrl();
}
function renderPrice(){
 if(!currentData){showResearchEmpty();return;}validatePrice(currentData,strategy==='vix');const opt=options();
 if(opt.start>=opt.end)throw Error('結束日期必須晚於開始日期');
 const filtered=currentData.prices.filter(r=>r.date>=opt.start&&r.date<=opt.end);if(filtered.length<2)throw Error('所選日期範圍有效行情不足兩筆');
 let r,rows;
 if(strategy==='bb'){r=BbEngine.run(currentData.prices,{...opt,period:+$('period').value,k:+$('multiplier').value,mode:$('bbMode').value,calendar:currentData.calendar});rows=r.rows;}
 else{rows=VixEngine.align({...currentData,prices:filtered});r=VixEngine.run(rows,opt);}
 lastResult={...r,strategy,symbol:currentData.symbol,configuration:opt};
 $('heading').textContent=currentData.symbol+' · '+(currentData.name||'歷史研究');$('range').textContent=rows[0].date+' → '+rows.at(-1).date+' · '+rows.length+' 日';
 $('resultEyebrow').textContent=strategy==='bb'?'BOLLINGER BANDS / PRICE STRUCTURE':'VIX / MARKET VOLATILITY';
 const details=['單標的全額配置，允許零碎股；未模擬開盤漲跌停、委託排隊及交易容量。','FinMind 來源日線原始價格，未重建拆股與現金股利；可能出現公司行為價格跳空。使用標的原幣計價、不換匯。','期末持倉按最後收盤估值，未扣假設平倉成本；勝率只計完成交易。','全期間結果屬歷史樣本內研究，未證明具有未來優勢。'];
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
 $('results').hidden=false;$('empty').hidden=true;status('回測完成 · '+rows.length+' 筆有效日線 · '+r.events.length+' 次模擬成交'+(imported?' · 本機匯入資料':' · 按需查詢版本已固定'));updateUrl();
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
function showResearchEmpty(){
 $('results').hidden=true;$('empty').hidden=false;$('empty').textContent='輸入股票代號並執行研究，或匯入自己的資料。';$('metrics').innerHTML='';$('range').textContent='—';$('resultEyebrow').textContent=strategy==='rev'?'REVENUE / PRICE MOMENTUM':'STRATEGY OVERVIEW';$('heading').textContent=strategy==='rev'?'REV-MOM · 營收異常與價格動能':strategy==='chip'?'S1／S2／S3 · 法人籌碼研究':'VIX Atlas · 策略觀測台';
}
async function fetchPrice(symbol,start,end,withVix=false){
 const tw=/\.TW(O)?$/.test(symbol),dataset=tw?'TaiwanStockPrice':'USStockPrice';
 const e=await dataClient.get(dataRequest(dataset,symbol,start,end));const prices=AtlasData.priceRows(e,symbol),d={schema_version:'1.4',symbol,name:catalog.find(c=>c.provider_symbol===symbol)?.name_zh||catalog.find(c=>c.provider_symbol===symbol)?.name_en||symbol,currency:tw?'TWD':'USD',prices,source:e.source,fetchedAt:e.fetched_at,price_adjustment:'provider unadjusted; corporate actions unverified',envelopes:[{...e,data:undefined}]};
 if(withVix){const v=await dataClient.get(dataRequest('USStockPrice','^VIX',start,end));d.vix=AtlasData.priceRows(v,'^VIX').map(r=>({date:r.date,close:r.close}));d.envelopes.push({...v,data:undefined});}
 validatePrice(d,withVix);return d;
}
async function loadPrice(e){
 e?.preventDefault();if(strategy==='data')return;
 const token=++requestId;$('run').disabled=true;
 try{
  if(strategy==='auto'){await runAutoScan();return;}if(['chip','rev'].includes(strategy)){status('準備本次研究資料…');await runResearch();return;}
  const symbol=resolveSymbol();if($('start').value>=$('end').value)throw Error('日期範圍無效');status('直接向來源查詢 '+symbol+'…');
  if(imported&&currentData?.symbol===symbol){renderPrice();return;}
  if(isFile)throw Error('離線模式請匯入自己的資料包');
  const warmup=new Date(Date.parse($('start').value)-400*864e5).toISOString().slice(0,10),d=await fetchPrice(symbol,warmup,$('end').value,strategy==='vix');
  if(token!==requestId)return;currentData=d;imported=false;$('symbolSearch').value=symbol;if(strategy==='bb'&&!taxManual)$('tax').value=d.currency==='TWD'?'0.3':'0';renderPrice();
 }catch(error){status(error.message||'資料取得失敗',true);notice('本次未完成計算。既有圖表若仍顯示，屬上次成功的研究。可稍後重試或匯入自己的資料包。');}
 finally{if(token===requestId)$('run').disabled=false;}
}
async function fetchUniverse(rev=false){
 if($('dataMode').value==='latest')throw Error('歷史營收／籌碼研究請選「代理研究」或提供已保存的歷史版本；最新資料不能證明歷史公布時間。');
 const ids=SelectionModel.researchSymbols(stockSlots);
 if(!ids.length||ids.length>5||ids.some(x=>!/^\d{4,6}\.TW(O)?$/.test(x)))throw Error('請提供 1–5 檔台灣上市／上櫃股票代號');
 const end=$('end').value,start=new Date(Date.parse($('start').value)-(rev?3*366:400)*864e5).toISOString().slice(0,10),symbols=[],manifests=[];
 // Sequential bounded collection: any failed source cancels the new run, preserving previous results.
 const benchmark=await fetchPrice('0050.TW',start,end,false),calendar=benchmark.prices.map(r=>r.date);manifests.push(...benchmark.envelopes);
 for(const symbol of ids){
  status('查詢 '+symbol+' · '+(symbols.length+1)+' / '+ids.length+'…');const d=await fetchPrice(symbol,start,end,false),info=catalog.find(c=>c.provider_symbol===symbol),get=ds=>dataClient.get(dataRequest(ds,symbol,start,end));
  const institutions=rev&&$('revInstitution').value==='no'?null:await get('TaiwanStockInstitutionalInvestorsBuySell'),margin=rev?null:await get('TaiwanStockMarginPurchaseShortSale');
  const stock={symbol,security_id:symbol,industry:info?.industry||'unknown',prices:AtlasData.joinChips(d.prices,institutions,margin),corporate_actions:[]};
  if(rev){const revenue=await get('TaiwanStockMonthRevenue'),financial=await get('TaiwanStockFinancialStatements');stock.revenues=AtlasData.revenueRows(revenue);stock.financials=AtlasData.financialRows(financial);manifests.push({...revenue,data:undefined},{...financial,data:undefined});}
  symbols.push(stock);manifests.push(...d.envelopes,...(institutions?[{...institutions,data:undefined}]:[]),...(margin?[{...margin,data:undefined}]:[]));
 }
 const keep=new Set(calendar);for(const s of symbols)s.prices=s.prices.filter(r=>keep.has(r.date));
 return {schema_version:'1.5',universe_basis:stockSlots.some(s=>s.origin==='auto')?'present snapshot selections; historical fixed-sample exploration, not historical automatic selection':'user-fixed current-survivor sample',selection_snapshot:stockSlots.map(s=>({symbol:s.symbol,origin:s.origin,audit:s.audit??null})),calendar,symbols,benchmark:{symbol:'0050.TW',prices:benchmark.prices},coverage_complete:true,availability_basis:availability(),evidence_complete:false,point_in_time_universe:false,corporate_actions_complete:false,calendar_id:'0050.TW observed sessions; proxy calendar',source:'FinMind browser direct; personal research',manifest:{spec_version:'1.4',created_at:new Date().toISOString(),sources:manifests,universe:ids,calendar_id:'0050.TW observed sessions; proxy calendar',limitations:['No original publication vintages','Corporate actions / delistings / opening limits unverified']}};
}
async function runResearch(){
 const rev=strategy==='rev',local=rev?rawRev:rawChip;if(rev&&$('revExecution').value==='odd'&&!local)throw Error('ODD_LOT_EVIDENCE_REQUIRED · 十萬元零股研究需匯入獨立零股撮合價格與費率證據；一般整股開盤不能代用。');const u=local||await fetchUniverse(rev);loadedUniverse=JSON.parse(JSON.stringify(u));
 if(rev)await renderRev(loadedUniverse);else await renderChip(loadedUniverse);
}
function updateHolding(){const id=$('chipStrategy').value,selected=+$('holding').value,hs=ChipEngine.horizons[id];$('holding').innerHTML=hs.map(h=>`<option value="${h}" ${h===(hs.includes(selected)?selected:hs[1])?'selected':''}>${h} 日</option>`).join('');const allow=id==='S2'&&+$('holding').value===5;$('ranking').disabled=!allow;if(!allow)$('ranking').value='symbol';}
async function renderChip(input=null){
 if(strategy!=='chip')return;if(!input&&!rawChip){showResearchEmpty();return;}const u=input||rawChip;
 const opts={strategy:$('chipStrategy').value,holding:+$('holding').value,ranking:$('ranking').value,availability:availability(),execution:$('executionMode').value,capital:1000000,fee:.001425,tax:.003,slip:.0005,minFee:20,lot:1000,start:$('start').value,end:$('end').value};
 const r=ChipEngine.simulatePortfolio(u,opts),runs=[];
 for(const [id,hs] of Object.entries(ChipEngine.horizons))for(const h of hs){const x=ChipEngine.simulatePortfolio(u,{...opts,strategy:id,holding:h,ranking:'symbol'});runs.push({id:id+'-h'+h,total:x.total,trades:x.trades.length});}
 lastResult={...r,strategy:'chip',manifest:await makeManifest(u,opts),baselines:runs};
 showPortfolio(r,'S1／S2／S3 · 法人籌碼研究');$('researchPanel').hidden=false;
 $('baselineGrid').innerHTML=runs.map(x=>`<div><span>${x.id}</span><strong>${pct(x.total)}</strong><small>${x.trades} 筆完成交易</small></div>`).join('');
 const base=ChipEngine.simulatePortfolio(u,{...opts,ranking:'symbol'});const stats=ResearchStatistics.bootstrap(ResearchStatistics.pairedReturns(r.curve,base.curve));$('statistics').textContent='相同候選固定排序配對比較：'+(stats.ci?'每日淨報酬差 '+pct(stats.mean)+'，95% 區間 '+stats.ci.map(pct).join(' ～ '):'有效日期不足')+'。九組基準保留；統計只作探索。';
 $('assumptions').innerHTML='<p>S1／S2／S3 原門檻與九組持有期保留。120 個完整市場交易日暖機，缺值不當成零。R1 僅比較相同 S2 候選。五檔／20%／產業 40%／前 20 日均量 1% 限制；新買單失敗取消，無同開盤替補；賣款次日可用。來源時間不完整時只能作代理研究。</p>';
}
async function makeManifest(u,opts){
 const input_hash=await AtlasData.hash(u);return {...u.manifest,...ATLAS_BUILD,schema_version:'1.5',spec_version:strategy==='rev'?RevMomEngine.spec:'chip-1.3',configuration:opts,input_hash,created_at:new Date().toISOString(),statistical_seed:20261022,adoption:'NOT_ADOPTED',price_adjustment:'unadjusted; corporate actions unverified unless supplied',universe_basis:u.universe_basis||'user-fixed current-survivor sample'};
}
function showPortfolio(r,title){
 $('heading').textContent=title;$('resultEyebrow').textContent='CAUSAL SIGNALS / EXPLORATORY PORTFOLIO';$('range').textContent=(r.curve[0]?.date||'—')+' → '+(r.curve.at(-1)?.date||'—');
 notice((r.options.availability==='proxy'?'代理研究 · 無歷史初次公布版本；':'嚴格時間檢查 · ')+(r.options.execution==='strict'?'缺開盤成交證據的訂單不成交。':'日線成交近似，未建模開盤限制。')+' 尚未通過策略採用門檻。');
 metric([['組合累積報酬',pct(r.total),'green','初始 NT$'+money(r.options.capital)],['年化報酬',pct(r.cagr)],['最大回撤',pct(r.mdd),'red'],['已完成交易',String(r.trades.length),'','期末 '+r.positions.length+' 檔'],['完成交易勝率',pct(r.winRate)],['候選訊號',String(r.signals.length)],['未成交／未選中',String(r.orderEvents.filter(e=>['CANCELLED','NOT_SELECTED'].includes(e.status)).length)],['研究狀態','尚未採用']]);
 $('pricePanel').hidden=true;$('indicatorPanel').hidden=true;$('heatmapPanel').hidden=true;$('researchPanel').hidden=true;$('tradePanel').hidden=false;$('signalCard').hidden=true;
 chart('equityChart',r.curve,[{key:'equity',color:'#76e2bd',label:'組合資產'}]);$('equityLegend').textContent='━ 本次固定資料版本';$('position').textContent='最多五檔／單檔 20%／產業 40%／'+(r.options.lot===1?'零股獨立證據模式':'整張')+'／單邊手續費 0.1425%／最低 20 元／賣出稅 0.3%／單邊滑價 0.05%。期末部位按收盤估值，不假設平倉。';
 renderTrades(r.trades);$('sourceInfo').textContent='資料雜湊 '+lastResult.manifest.input_hash.slice(0,16)+' · '+(r.options.availability==='proxy'?'代理資料':'歷史版本驗證')+' · 原始觀測僅在瀏覽器處理';if(stockSlots.some(s=>s.origin==='auto'))notice($('notice').textContent+' 本清單包含目前自動研究入選股；歷史圖只比較此固定樣本，並非逐日自動選股回測。');$('results').hidden=false;$('empty').hidden=true;status('研究完成 · '+r.signals.length+' 個候選 · '+r.trades.length+' 筆完成交易');
}
async function renderRev(u){
 const odd=$('revExecution').value==='odd';const opts={capital:odd?100000:10000000,lot:odd?1:1000,exit:$('revExit').value,holding:+$('revHolding').value,ranking:$('revRanking').value,institution:$('revInstitution').value==='yes',availability:availability(),execution:$('executionMode').value,start:$('start').value,end:$('end').value};
 const r=RevMomEngine.simulatePortfolio(u,opts),base=RevMomEngine.simulatePortfolio(u,opts.exit==='M30'?{...opts,exit:'F20',holding:30,requireAtr:true}:{...opts,ranking:'symbol'}),stats=ResearchStatistics.bootstrap(ResearchStatistics.pairedReturns(r.curve,base.curve));
 const pairedIds=x=>x.signals.filter(s=>s.executionDate).map(s=>s.event_id+'@'+s.executionDate).sort();if(JSON.stringify(pairedIds(r))!==JSON.stringify(pairedIds(base)))throw Error('比較候選母體不一致');
 lastResult={...r,strategy:'rev',manifest:await makeManifest(u,opts),comparison:{baseline:opts.exit==='M30'?'same pool / F-h30 / same ranking':'same pool / fixed code',statistics:stats,seed:20261022},baselineCurve:base.curve};showPortfolio(r,r.options.variant);const baselineLabel=opts.exit==='M30'?'同候選／同排序 · 固定 h30':'同候選固定排序';
 $('researchPanel').hidden=false;$('baselineGrid').innerHTML='<div><span>'+baselineLabel+'</span><strong>'+pct(base.total)+'</strong><small>'+base.trades.length+' 筆完成交易</small></div><div><span>本次配置排序</span><strong>'+pct(r.total)+'</strong><small>'+r.trades.length+' 筆完成交易</small></div>';
 chart('equityChart',r.curve.map((x,i)=>({...x,baseline:base.curve[i].equity})),[{key:'equity',color:'#76e2bd',label:'本次排序'},{key:'baseline',color:'#8cbaff',label:baselineLabel}]);
 $('statistics').textContent='配對每日組合淨報酬差：'+(stats.ci?pct(stats.mean)+'，95% 區間 '+stats.ci.map(pct).join(' ～ '):'有效日期不足')+'。固定區塊 30 日、5,000 次、種子 20261022；整日截面一起重抽樣。此比較屬探索，未證明樣本外優勢。';
 const counts={};for(const e of r.eventLog)counts[e.status]=(counts[e.status]||0)+1;
 $('signalCard').hidden=false;$('signalCard').innerHTML='<div><div class="section-label">EVENT AUDIT</div><h3>事件凍結，首次符合才嘗試一次</h3><p>'+Object.entries(counts).map(([k,v])=>esc(k)+': '+v).join(' · ')+'</p><p>回補資料標記為歷史回補，不視為今天新公布訊號。事件與拒單明細可匯出研究 JSON。</p></div>';
 $('assumptions').innerHTML='<p>YoY＞10%、較前 3 月加速＞5 個百分點、穩健營收異常 Z＞1、TTM 營益率＞0；25 個連續可比正營收月與當時已公布四季財報。金融業排除。d0 起五個市場收盤，收盤高於 SMA20 與不含當日的前十日最高價，僅一次次日開盤嘗試。事件修訂不重開、已持有不加碼或重設時鐘。</p><p>F20 固定持有期為主比較；M30 ATR／EMA 為獨立候選，最高線不下移、兩個相鄰市場收盤跌破 EMA10 後次開盤賣出，最晚在實際入場＋30 市場日開盤嘗試出場。阻塞賣單保留風險。ATR 初始風險僅作診斷，未按任意風險百分比調整配置。</p><p>FinMind 入庫日不是正式公告時間。線上代理資料使用明示日期假設；財報以來源單季欄位計算，原始版本與公司行為仍待驗證。無 IFP 版本採 Z／RS20＝2：1；RS20 為個股 20 市場日報酬減去同日期 0050 價格報酬（ETF 代理，非認證指數）；與主版本跨覆蓋範圍的差異不能解釋成排序增益。十萬元零股交易需要獨立撮合證據。</p>';
}
function renderCatalog(){
 const q=$('catalogQuery').value.trim().toLowerCase(),filter=$('catalogFilter').value,found=catalog.filter(c=>(filter==='all'||c.market===filter)&&(!q||[c.provider_symbol,c.name_zh,c.name_en].some(v=>v?.toLowerCase().includes(q))));
 $('heading').textContent='資料中心 · 按需查詢';$('range').textContent=catalog.length.toLocaleString()+' 筆目錄';$('catalogCount').textContent=found.length.toLocaleString()+' 筆符合';
 $('catalogRows').innerHTML=found.slice(0,catalogLimit).map(c=>`<tr><td><button class="catalog-button" data-catalog-symbol="${esc(c.provider_symbol)}">${esc(c.provider_symbol)}</button><div class="hint">${esc(c.exchange)} · ${esc(c.currency)}</div></td><td>${esc(c.name_zh||c.name_en)}</td><td>${esc(c.industry||'—')}</td><td>${esc(c.date||'—')}</td><td>直接查詢來源</td></tr>`).join('')||'<tr><td colspan="5">輸入代號可直接查詢，目錄暫無符合資料。</td></tr>';
 $('moreCatalog').hidden=found.length<=catalogLimit;document.querySelectorAll('[data-catalog-symbol]').forEach(b=>b.onclick=()=>{$('symbolSearch').value=b.dataset.catalogSymbol;setStrategy('bb',false);loadPrice();});
}
async function loadCatalog(){
 if(isFile)return;
 const sources=[['TaiwanStockInfo','TW'],['USStockInfo','US']];let ok=0;
 for(const [ds,market] of sources){try{
  const e=await dataClient.get({dataset:ds,mode:'latest'}),map=new Map();catalogSnapshots=catalogSnapshots.filter(x=>x.market!==market).concat([{market,dataset:e.dataset,revision:e.dataset_revision,fetched_at:e.fetched_at,source:e.source}]);
  for(const r of e.data){if(market==='TW'&&!['twse','tpex'].includes(r.type))continue;const provider_symbol=market==='TW'?r.stock_id+(r.type==='twse'?'.TW':'.TWO'):r.stock_id;if(!/^[A-Z0-9.^=-]{1,24}$/.test(provider_symbol))continue;map.set(provider_symbol,{provider_symbol,symbol:r.stock_id,name_zh:market==='TW'?r.stock_name:'',name_en:market==='US'?r.stock_name:'',exchange:market==='TW'?r.type.toUpperCase():'US',currency:market==='TW'?'TWD':'USD',market,industry:r.industry_category||r.Subsector||'',date:r.date});}
  catalog=catalog.filter(c=>c.market!==market).concat([...map.values()]);ok++;updateSuggestions();
 }catch(e){status('目錄部分未讀取：'+e.message,true);}}
 $('snapshotCount').textContent=catalog.length.toLocaleString();$('snapshotAsOf').textContent='台股 '+catalog.filter(c=>c.market==='TW').length+' · 美股 '+catalog.filter(c=>c.market==='US').length;
 $('dataHealth').textContent='目錄來源成功 '+ok+'/2。行情直接從 FinMind 讀入你的瀏覽器；目前交易所日期的日線保守排除，來源完成狀態仍未認證。快取過期不會把舊版本當作新版本。嚴格歷史查詢只讀取此瀏覽器曾保存的版本，缺少時不回退最新資料。來源使用限個人研究，不再散布原始觀測。';if(strategy==='data')renderCatalog();renderStockSlots();
}
function slotSignature(){return JSON.stringify({slots:SelectionModel.fingerprint(stockSlots),market:$('selectionMarket').value,pool:$('poolSource').value,size:$('poolSize').value,target:$('targetSlots').value,institution:$('autoInstitution').value,mode:$('dataMode').value,as_of:$('asOf').value});}
function persistStockSlots(){try{localStorage.setItem('atlas-research-slots-v1',SelectionModel.serialize(stockSlots,$('selectionMarket').value));}catch{/* Selection stays in this tab if browser storage is unavailable. */}}
function invalidateSelection(){if($('selectionTransfer'))$('selectionTransfer').hidden=true;pendingSelection=null;$('applyRecommendations').disabled=true;if(screenResult)$('autoStale').hidden=false;if(scanAbort)scanAbort.abort();}
function renderStockSlots(){
 const market=$('selectionMarket').value,busy=!!scanAbort;
 stockSlots=stockSlots.map(s=>{const c=catalog.find(c=>c.provider_symbol===s.symbol);return c?{...s,name:c.name_zh||c.name_en||s.symbol,industry:c.industry||'unknown',market:c.market}:s;});
 persistStockSlots();$('slotCount').textContent=stockSlots.length+' / 5 格';$('addSlot').disabled=stockSlots.length>=5||busy;
 $('stockSlots').innerHTML=stockSlots.map((s,i)=>`<div class="stock-slot ${s.locked?'locked':''}"><div class="slot-toolbar"><span>股票 ${i+1}</span><div><button type="button" data-slot-lock="${i}" aria-pressed="${!!s.locked}" ${!s.symbol||busy?'disabled':''}>${s.locked?'已鎖定':'鎖定'}</button><button type="button" data-slot-remove="${i}" aria-label="刪除股票 ${i+1}" ${stockSlots.length===1||s.locked||busy?'disabled':''}>×</button></div></div><label class="sr-only" for="stockSlot${i}">股票 ${i+1} 公司或完整代號</label><input id="stockSlot${i}" data-slot-input="${i}" list="slotSuggestions${i}" value="${esc(s.draft??s.symbol)}" placeholder="公司名稱／完整代號" autocomplete="off" ${s.locked||busy?'disabled':''}><datalist id="slotSuggestions${i}"></datalist><div class="hint slot-detail">${esc(s.name||'尚未選股')}${s.symbol?' · '+esc(s.symbol.endsWith('.TWO')?'上櫃':s.market==='US'?'美國':'上市'):''}${s.origin==='auto'?' · 自動研究入選':''}${s.audit?.as_of?'<br>截止 '+esc(s.audit.as_of):''}</div><div class="slot-moves"><button type="button" data-slot-up="${i}" ${i===0||busy?'disabled':''}>↑ 上移</button><button type="button" data-slot-down="${i}" ${i===stockSlots.length-1||busy?'disabled':''}>↓ 下移</button>${s.symbol?`<button type="button" data-slot-price="${i}">查看布林 ↗</button>`:''}</div></div>`).join('');
 const suggestions=(input,i)=>{const q=input.value.trim().toLowerCase();$('slotSuggestions'+i).innerHTML=catalog.filter(c=>c.market===market&&(!q||[c.provider_symbol,c.name_zh,c.name_en].some(v=>v?.toLowerCase().includes(q)))).slice(0,25).map(c=>`<option value="${esc(c.provider_symbol)}" label="${esc(c.name_zh||c.name_en)} · ${esc(c.exchange)}"></option>`).join('');};
 document.querySelectorAll('[data-slot-input]').forEach(input=>{const i=+input.dataset.slotInput;suggestions(input,i);input.oninput=()=>{stockSlots[i]={...stockSlots[i],symbol:'',draft:input.value,audit:null};input.setCustomValidity('');invalidateSelection();suggestions(input,i);};input.onchange=()=>{try{const stock=SelectionModel.resolve(input.value,catalog,{market});stockSlots=SelectionModel.set(stockSlots,i,stock);stockSlots[i].draft=undefined;invalidateSelection();renderStockSlots();}catch(e){input.setCustomValidity(e.message);status(e.message,true);}};});
 document.querySelectorAll('[data-slot-lock]').forEach(b=>b.onclick=()=>{const i=+b.dataset.slotLock;stockSlots[i].locked=!stockSlots[i].locked;invalidateSelection();renderStockSlots();});
 document.querySelectorAll('[data-slot-remove]').forEach(b=>b.onclick=()=>{stockSlots.splice(+b.dataset.slotRemove,1);invalidateSelection();renderStockSlots();});
 for(const [attr,delta] of [['slotUp',-1],['slotDown',1]])document.querySelectorAll('[data-'+(delta<0?'slot-up':'slot-down')+']').forEach(b=>b.onclick=()=>{const i=+b.dataset[attr],j=i+delta;[stockSlots[i],stockSlots[j]]=[stockSlots[j],stockSlots[i]];invalidateSelection();renderStockSlots();});
 document.querySelectorAll('[data-slot-price]').forEach(b=>b.onclick=()=>{$('symbolSearch').value=stockSlots[+b.dataset.slotPrice].symbol;setStrategy('bb',false);loadPrice();});
}
function updateScanEstimate(){const n=+$('poolSize').value,calls=1+n*($('autoInstitution').value==='yes'?6:5);$('scanEstimate').textContent=`最多 ${calls} 次來源請求，冷快取約需 ${Math.ceil(calls/24)} 分鐘以上；依實際回應與快取而定。候選池不是全市場排名。`;}
function screenCounts(counts){const names={scanned:'候選數',valid_data:'有效資料',quality:'品質通過',revenue:'營收通過',technical:'技術通過',institution:'法人／完整排名',recommendable:'可推薦',selected:'本次自動入選'};$('scanCounts').innerHTML=Object.entries(names).map(([k,v])=>`<div><strong>${counts[k]??0}</strong><span>${v}</span></div>`).join('');}
async function collectAutoUniverse(pool,asOf,controller){
 const mode=$('dataMode').value,requestedAsOf=mode==='historical_asof'?$('asOf').value+':00+08:00':'',end=AtlasData.calendarDate(new Date(asOf),'Asia/Taipei'),start=new Date(Date.parse(end)-3*366*864e5).toISOString().slice(0,10),sources=[],symbols=[],errors=[];
 const get=(dataset,symbol)=>dataClient.get({dataset,symbol,start,end,mode,as_of:requestedAsOf,currency:'TWD'},{queue:true,signal:controller.signal,onWait:ms=>{$('scanProgress').textContent='等待來源預算 · 約 '+Math.ceil(ms/1000)+' 秒 · 已完成 '+symbols.length+' / '+pool.symbols.length;}});
 const bench=await get('TaiwanStockPrice','0050.TW'),benchmark={symbol:'0050.TW',prices:AtlasData.priceRows(bench,'0050.TW')};sources.push({...bench,data:undefined});
 for(const symbol of pool.symbols){
  if(controller.signal.aborted)throw Error('CANCELLED · 已停止本次掃描');$('scanProgress').textContent='收集 '+symbol+' · '+(symbols.length+errors.length+1)+' / '+pool.symbols.length;
  try{
   const price=await get('TaiwanStockPrice',symbol),revenue=await get('TaiwanStockMonthRevenue',symbol),financial=await get('TaiwanStockFinancialStatements',symbol),cash=await get('TaiwanStockCashFlowsStatement',symbol),balance=await get('TaiwanStockBalanceSheet',symbol),flow=$('autoInstitution').value==='yes'?await get('TaiwanStockInstitutionalInvestorsBuySell',symbol):null;
   const info=catalog.find(c=>c.provider_symbol===symbol);symbols.push({symbol,security_id:symbol,name:info?.name_zh||symbol,industry:info?.industry||'unknown',prices:AtlasData.joinChips(AtlasData.priceRows(price,symbol),flow,null),revenues:AtlasData.revenueRows(revenue),financials:AtlasData.financialRows(financial),cash_flows:AtlasData.qualityRows(cash,'cash_flows'),balance_sheets:AtlasData.qualityRows(balance,'balance_sheets'),corporate_actions:[]});for(const e of [price,revenue,financial,cash,balance,flow].filter(Boolean))sources.push({...e,data:undefined});
  }catch(e){if(controller.signal.aborted||e.code==='CANCELLED')throw e;errors.push({symbol,reason:e.code||'UPSTREAM_UNAVAILABLE'});if(['RATE_LIMITED','AUTH_REQUIRED','UPSTREAM_UNAVAILABLE'].includes(e.code)){for(const left of pool.symbols.slice(symbols.length+errors.length))errors.push({symbol:left,reason:'NOT_COLLECTED_AFTER_SOURCE_FAILURE'});break;}}
 }
 const calendar=benchmark.prices.map(r=>r.date),allowed=new Set(calendar);for(const s of symbols)s.prices=s.prices.filter(r=>allowed.has(r.date));
 return {schema_version:'1.5',market:'TW',calendar,symbols,benchmark,coverage_complete:errors.length===0,collection_errors:errors,expected_symbols:pool.symbols,availability_basis:mode==='proxy'?'proxy':'strict',point_in_time_universe:false,corporate_actions_complete:false,manifest:{candidate_pool:pool,catalog_versions:JSON.parse(JSON.stringify(catalogSnapshots)),snapshot_cutoff:asOf,collection_started_at:asOf,collection_finished_at:new Date().toISOString(),sources,source_calendar:'0050 ETF observed sessions; unverified finality',source_assumptions:['Financial single-quarter proxy; cashflow YTD proxy','Current-survivor bounded pool, no historical portfolio','No source publication/finality certification']}};
}
async function runAutoScan(){
 if(scanAbort)throw Error('已有掃描進行中');if($('dataMode').value==='latest')throw Error('自動事件研究請明確選擇代理或歷史已保存版本；最新資料不證明歷史公告。');if($('selectionMarket').value!=='TW')throw Error('US_AUTO_SOURCE_UNAVAILABLE · 美股可手動研究股價；自動基本面策略尚待獨立來源契約');
 SelectionModel.validate(stockSlots,{allowEmpty:true});const target=+$('targetSlots').value;if(stockSlots.some((s,i)=>s.locked&&i>=target))throw Error('請先解除超出目標格數的鎖定');
 if(!catalog.length&&!rawAuto)await loadCatalog();const controller=new AbortController();scanAbort=controller;const signature=slotSignature(),source=$('poolSource').value,pool=rawAuto?{id:'user-imported-pool',symbols:rawAuto.symbols.map(s=>s.symbol),basis:'user-supplied; evidence must be verified'}:AutoScreen.pool(catalog,{source,size:+$('poolSize').value});
 if(!pool.symbols.length){scanAbort=null;throw Error('候選目錄尚未讀取，請稍後重新查詢');}
 const asOf=$('dataMode').value==='historical_asof'?$('asOf').value+':00+08:00':new Date().toISOString();pendingSelection=null;$('applyRecommendations').disabled=true;$('cancelScan').hidden=false;$('autoStale').hidden=true;renderStockSlots();status('固定本次候選池，開始逐層收集…');$('candidateScope').textContent=pool.id+' · '+pool.symbols.length+' 檔 · '+pool.symbols.join('、');
 try{
  const u=rawAuto?JSON.parse(JSON.stringify(rawAuto)):await collectAutoUniverse(pool,asOf,controller);if(controller.signal.aborted||signature!==slotSignature())throw Error('CANCELLED · 設定已變更，本次不更新清單');
  const result=AutoScreen.screen(u,{as_of:asOf,availability:availability(),institution:$('autoInstitution').value==='yes',slots:target,locked:stockSlots.filter(s=>s.locked),held_symbols:u.held_symbols??[]});
  result.manifest={...u.manifest,...ATLAS_BUILD,input_hash:await AtlasData.hash(u),rule_version:AutoScreen.VERSION,selection_basis:'current snapshot; never a historical portfolio',created_at:new Date().toISOString()};if(controller.signal.aborted||signature!==slotSignature())throw Error('CANCELLED · 設定已變更，本次不更新清單');screenResult=result;renderAutoResult(result);
  if(result.coverage_complete){const plan=SelectionModel.plan(stockSlots,result.recommendations,target);pendingSelection={...plan,signature};$('replacementPreview').innerHTML=plan.changes.length?'<p>確認後將更新：</p><ul>'+plan.changes.map(c=>`<li>第 ${c.slot} 格：${esc(c.from||'空格')} → ${esc(c.to||'空格')}</li>`).join('')+'</ul>':'<p>目前格子無需替換。</p>';$('replacementPreview').innerHTML+='<p>未填滿 '+plan.unfilled+' 格；不放寬門檻湊數。鎖定格完整保留。</p>';$('applyRecommendations').disabled=plan.accepted.length===0;if(!plan.accepted.length){pendingSelection=null;$('replacementPreview').textContent=result.recommendations.length?'推薦股票已在鎖定格中，沒有新的股票需要匯入；原清單保留。':'本次沒有合格推薦可匯入，原股票清單保留。可調整觀察池後重新掃描。';}}
  else{$('replacementPreview').textContent='候選資料不完整，本次不建立新排名或套用清單。上一個研究結果與持倉紀錄保留。';}
  $('scanProgress').textContent='掃描完成 · '+result.counts.scanned+' 個候選 · '+result.counts.recommendable+' 個可推薦';status(result.coverage_complete?'本次快照研究完成 · 預覽後可確認套用':'PARTIAL · 資料不完整，本次不更新股票格',!result.coverage_complete);
 }finally{scanAbort=null;$('cancelScan').hidden=true;renderStockSlots();}
}
function renderAutoResult(result){
 screenCounts(result.counts);$('exportScreen').disabled=false;$('heading').textContent='自動選股 · '+result.signal_date;$('range').textContent='截止 '+result.as_of;
 const reasons={QUALITY_PROFIT_HISTORY_MISSING:'四季獲利資料不足',QUALITY_STATEMENT_ALIGNMENT_MISSING:'財報／現金流期間未對齊',QUALITY_SCOPE_MISMATCH:'會計範圍／單位不同',QUALITY_BALANCE_MISSING:'資產負債資料不足',QUALITY_LOSS_QUARTER:'存在虧損季度',QUALITY_NONPOSITIVE_CFO:'營運現金流未轉正',QUALITY_BALANCE_RISK:'權益／負債風險',PRICE_OR_BENCHMARK_INCOMPLETE:'行情／基準不完整',NO_ACTIVE_REVENUE_EVENT:'目前沒有合格營收事件',NO_FIRST_BREAKOUT_TODAY:'本次未出現首次突破',EVENT_ALREADY_ATTEMPTED:'該事件已出現過買入嘗試',LIQUIDITY_GATE:'流動性未通過',INSTITUTION_DATA_MISSING:'法人資料不足',EXCLUDED_FINANCIAL:'金融業另案研究',PARTIAL_NO_NEW_RANKING:'資料不全，暫不排名'};
 $('recommendationCards').innerHTML=result.recommendations.length?result.recommendations.map(r=>`<article><span>本次排序 ${r.score_rank}</span><h3>${esc(r.name)} <small>${esc(r.symbol)}</small></h3><strong>分數 ${fmt(r.score,3)}</strong><p>營收 YoY ${pct(r.yoy)} · 加速 ${pct(r.accel)}<br>Z ${fmt(r.z_rev)} · RS20 ${pct(r.rs20)} · IFP5 ${pct(r.ifp5)}</p><small>收盤 ${r.signalDate} · ${esc(r.industry)}<br>代理研究候選，非委託或可採用訊號</small></article>`).join(''):'<p>本次沒有可填入的候選；不代表沒有好股票，也不放寬規則填滿格子。</p>';
 const rejected=new Map(result.unselected.map(r=>[r.symbol,r.reason]));$('screenAudit').innerHTML=[...result.audit,...result.collection_errors.map(r=>({symbol:r.symbol,stages:{},reasons:[r.reason]}))].map(r=>`<tr><td>${esc(r.name||r.symbol)}<div class="hint">${esc(r.symbol)}</div></td>${['quality','revenue','technical','institution'].map(k=>'<td>'+(r.stages[k]?'通過':'—')+'</td>').join('')}<td>${esc((r.reasons.length?r.reasons:[rejected.get(r.symbol)||'本次完整候選']).map(x=>reasons[x]||x).join('；'))}</td></tr>`).join('');
 $('candidateScope').textContent='候選池 '+(result.candidate_pool.id??'import')+' · 資料截至 '+result.as_of+' · '+(result.availability==='proxy'?'使用時間／來源代理假設':'嚴格可得時間檢查')+' · 非全市場／歷史自動選股回測';
}

function download(text,name,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob(['\ufeff'+text],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const csvCell=value=>{let s=String(value??'');if(typeof value==='string'&&/^[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
$('form').onsubmit=e=>{e.preventDefault();Promise.resolve(loadPrice()).catch(e=>status(e.message,true));};
$('symbolSearch').oninput=updateSuggestions;
$('tax').oninput=()=>{taxManual=true;};
$('market').onchange=()=>{updateSuggestions();};
for(const id of ['chipStrategy','holding','ranking'])$(id).onchange=()=>{updateHolding();if(rawChip)renderChip().catch(e=>status(e.message,true));};
document.querySelectorAll('[data-symbol]').forEach(b=>b.onclick=()=>{$('symbolSearch').value=b.dataset.symbol;loadPrice();});
document.querySelectorAll('[data-strategy]').forEach(b=>b.onclick=()=>setStrategy(b.dataset.strategy));
$('tab-vix').parentElement.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...document.querySelectorAll('[data-strategy]')],i=tabs.findIndex(b=>b.dataset.strategy===strategy),n=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length;tabs[n].focus();setStrategy(tabs[n].dataset.strategy);};
$('exportTrades').onclick=()=>{if(!lastResult)return;const keys=['symbol','signalDate','date','exitDate','price','exitPrice','units','commission','exitCommission','tax','pnl','return'];download([keys.map(csvCell).join(','),...(lastResult.trades||[]).map(t=>keys.map(k=>csvCell(t[k]??(k==='symbol'?currentData?.symbol:''))).join(','))].join('\n'),strategy+'-trades.csv','text/csv;charset=utf-8');};
$('exportData').onclick=()=>{if(lastResult)download(JSON.stringify(['chip','rev'].includes(strategy)?lastResult:{...currentData,research:{strategy,configuration:lastResult.configuration,signals:lastResult.signals||[],orderEvents:lastResult.orderEvents||[]}}),strategy+'-research.json','application/json');};
$('importFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>15e6)throw Error('股價 JSON 限 15 MB');const d=JSON.parse((await f.text()).replace(/^\uFEFF/,''));validatePrice(d,strategy==='vix');currentData=d;imported=true;$('symbolSearch').value=d.symbol;$('start').value=d.prices[0].date;$('end').value=d.prices.at(-1).date;if(['chip','rev','auto','data'].includes(strategy))setStrategy('bb',false);renderPrice();}catch(e){status(e.message,true);}};
$('chipFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>30e6)throw Error('籌碼 JSON 限 30 MB');const d=JSON.parse((await f.text()).replace(/^\uFEFF/,''));ChipEngine.validateUniverse(d);rawChip=d;$('chipModeHint').textContent='本機匯入 '+d.symbols.length+' 檔 · 嚴格成交證據模式 · 不上傳';await renderChip();}catch(e){status(e.message,true);}};
$('catalogQuery').oninput=()=>{catalogLimit=40;renderCatalog();};$('catalogFilter').onchange=()=>{catalogLimit=40;renderCatalog();};$('moreCatalog').onclick=()=>{catalogLimit+=60;renderCatalog();};
$('revFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>30e6)throw Error('JSON 限 30 MB');const u=JSON.parse((await f.text()).replace(/^\uFEFF/,''));ChipEngine.validateUniverse(u);rawRev=u;await renderRev(u);}catch(e){status(e.message,true);}};
$('dataMode').onchange=()=>{$('asOfControls').hidden=$('dataMode').value!=='historical_asof';};
$('revExit').onchange=()=>{$('revHolding').disabled=$('revExit').value==='M30';};
$('clearCache').onclick=async()=>{if(scanAbort)scanAbort.abort();await dataClient.store.clear();catalog=[];catalogSnapshots=[];loadedUniverse=null;rawChip=null;rawRev=null;currentData=null;lastResult=null;invalidateSelection();screenResult=null;rawAuto=null;$('exportScreen').disabled=true;$('scanCounts').innerHTML='';$('recommendationCards').innerHTML='<p>本機資料已清除。</p>';$('screenAudit').innerHTML='';$('replacementPreview').textContent='';renderCatalog();status('已清除目前瀏覽器保存的資料與版本');};
$('reloadCatalog').onclick=()=>loadCatalog();
const today=AtlasData.calendarDate(new Date(),'Asia/Taipei');$('end').max=today;$('end').value=today;$('asOf').value=today+'T08:30';
const query=new URLSearchParams(location.search),requested=query.get('strategy');
for(const key of ['start','end'])if(ResearchCore.validDate(query.get(key)))$(key).value=query.get(key);
if(query.get('symbol')&&/^[A-Z0-9.^=-]{1,24}$/.test(query.get('symbol').toUpperCase()))$('symbolSearch').value=query.get('symbol').toUpperCase();
setStrategy(['vix','bb','chip','rev','auto','data'].includes(requested)?requested:'vix',false);showResearchEmpty();if(strategy==='auto'){$('empty').hidden=true;$('heading').textContent='有界候選池 · 自動選股研究';}if(strategy==='data')renderCatalog();
loadCatalog();

$('addSlot').onclick=()=>{if(stockSlots.length>=5)return;stockSlots.push({symbol:'',name:'',locked:false,origin:'manual'});invalidateSelection();renderStockSlots();};
$('selectionMarket').onchange=()=>{invalidateSelection();if(stockSlots.some(s=>s.locked&&s.market!==$('selectionMarket').value)){status('請先解除不同市場的鎖定；目前清單保留。',true);$('selectionMarket').value=stockSlots.find(s=>s.locked).market;return;}stockSlots=[{symbol:'',name:'',market:$('selectionMarket').value,locked:false,origin:'manual'}];renderStockSlots();};
for(const id of ['poolSource','poolSize','targetSlots','autoInstitution'])$(id).onchange=()=>{invalidateSelection();updateScanEstimate();};
$('dataMode').addEventListener('change',invalidateSelection);$('asOf').addEventListener('change',invalidateSelection);
$('cancelScan').onclick=()=>scanAbort?.abort();
$('applyRecommendations').onclick=()=>{
 if(!pendingSelection||pendingSelection.signature!==slotSignature()){invalidateSelection();status('清單或設定已變更，請重新掃描。',true);return;}
 const accepted=pendingSelection.accepted;if(!accepted.length){invalidateSelection();status('本次沒有新的推薦可匯入，原清單保留。');return;}
 stockSlots=pendingSelection.slots;pendingSelection=null;rawRev=null;rawChip=null;loadedUniverse=null;lastResult=null;$('revFile').value='';$('chipFile').value='';$('applyRecommendations').disabled=true;
 renderStockSlots();setStrategy('rev');const ids=SelectionModel.researchSymbols(stockSlots);
 $('selectionTransfer').hidden=false;$('selectionTransfer').textContent='已匯入營收動能：'+ids.join('、')+'。鎖定格保留；選擇 F20／M30 後按「執行研究」。';
 $('replacementPreview').textContent='已確認並轉入營收動能：'+ids.join('、');status('已匯入 '+accepted.length+' 檔推薦 · 目前共 '+ids.length+' 檔 · 請執行研究');
 $('universeControls').scrollIntoView({block:'start',behavior:'smooth'});
};
$('autoFile').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>30e6)throw Error('候選資料包限30MB');const u=JSON.parse((await f.text()).replace(/^\uFEFF/,''));ChipEngine.validateUniverse(u);if(u.symbols.length>30)throw Error('候選池最多30檔');rawAuto=u;invalidateSelection();status('已匯入 '+u.symbols.length+' 檔候選包；只在本機處理。');}catch(e){status(e.message,true);}};
$('exportScreen').onclick=()=>{if(screenResult)download(JSON.stringify(screenResult),'auto-screen-research.json','application/json');};
try{const saved=SelectionModel.restore(localStorage.getItem('atlas-research-slots-v1'));if(saved){stockSlots=saved.slots;$('selectionMarket').value=saved.market;}}catch{}
renderStockSlots();updateScanEstimate();
