/* Editable research slots. Selection never means a live holding or an order. */
const SelectionModel=(()=>{
 const MAX=5;
 function resolve(text,catalog,{market='TW'}={}){
  const q=String(text??'').trim(),key=q.toLowerCase();if(!q)return null;
  let matches=catalog.filter(x=>x.market===market&&[x.provider_symbol,x.name_zh,x.name_en].some(v=>v&&v.toLowerCase()===key));
  if(!matches.length)matches=catalog.filter(x=>x.market===market&&x.symbol===q.toUpperCase());
  const unique=[...new Map(matches.map(x=>[x.provider_symbol,x])).values()];
  if(unique.length!==1)throw Error(unique.length?'同名或代號有多個市場，請選完整代號':'找不到此市場的證券，請從公司／代號建議中選擇');
  const r=unique[0];if(market==='TW'&&!/^\d{4,6}\.TW(O)?$/.test(r.provider_symbol))throw Error('不支援此證券類別');
  return {symbol:r.provider_symbol,name:r.name_zh||r.name_en||r.provider_symbol,industry:r.industry||'unknown',market:r.market};
 }
 function validate(slots,{allowEmpty=false}={}){
  if(!Array.isArray(slots)||slots.length<1||slots.length>MAX)throw Error('股票格須為 1–5 格');
  const seen=new Set();for(const s of slots){if(!s.symbol){if(s.locked||!allowEmpty)throw Error('請先選擇股票；空格不能鎖定');continue;}if(seen.has(s.symbol))throw Error('股票不可重複：'+s.symbol);seen.add(s.symbol);}
  return slots;
 }
 function set(slots,index,stock){
  if(slots[index]?.locked)throw Error('請先解除鎖定再修改股票');const next=slots.map((s,i)=>i===index?{...s,...stock,symbol:stock?.symbol??'',name:stock?.name??'',origin:'manual',audit:null}:({...s}));validate(next,{allowEmpty:true});return next;
 }
 function fingerprint(slots){return JSON.stringify(slots.map(s=>({symbol:s.symbol||'',locked:!!s.locked})));}
 function researchSymbols(slots){
  validate(slots,{allowEmpty:true});if(slots.some(s=>!s.symbol&&s.draft?.trim()))throw Error('請先完成正在編輯的股票代號');
  const ids=slots.filter(s=>s.symbol).map(s=>s.symbol);if(!ids.length)throw Error('目前沒有已選股票；請先選股或套用有效推薦');return ids;
 }
 function serialize(slots,market='TW'){return JSON.stringify({version:1,market,slots:slots.filter(s=>!s.draft).map(s=>({symbol:s.symbol||'',name:s.name||'',market:s.market||market,industry:s.industry||'unknown',locked:!!s.locked,origin:s.origin==='auto'?'auto':'manual',audit:s.audit?{as_of:s.audit.as_of,event_id:s.audit.event_id,version:s.audit.version}:null}))});}
 function restore(value){
  try{const saved=JSON.parse(value);if(saved?.version!==1||!Array.isArray(saved.slots))return null;const slots=saved.slots.map(s=>({symbol:typeof s.symbol==='string'?s.symbol:'',name:typeof s.name==='string'?s.name:'',market:s.market==='US'?'US':'TW',industry:typeof s.industry==='string'?s.industry:'unknown',locked:s.locked===true,origin:s.origin==='auto'?'auto':'manual',audit:s.audit&&typeof s.audit.as_of==='string'?{as_of:s.audit.as_of,event_id:s.audit.event_id??null,version:s.audit.version??null}:null}));
   if(slots.some(s=>s.symbol&&!/^[A-Z0-9.^=-]{1,24}$/.test(s.symbol)))return null;validate(slots,{allowEmpty:true});return {slots,market:saved.market==='US'?'US':'TW'};
  }catch{return null;}
 }
 function plan(slots,recommendations,target=slots.length){
  validate(slots,{allowEmpty:true});if(!Number.isInteger(target)||target<1||target>MAX)throw Error('推薦格數須為 1–5');
  if(slots.some((s,i)=>s.locked&&i>=target))throw Error('請先解除超出目標格數的鎖定');
  const available=recommendations.filter(r=>r.symbol&&!slots.some(s=>s.locked&&s.symbol===r.symbol));
  if(!available.length)return {slots:slots.map(s=>({...s})),changes:[],accepted:[],unfilled:slots.filter(s=>!s.symbol).length,reason:'NO_NEW_RECOMMENDATIONS'};
  const next=Array.from({length:target},(_,i)=>slots[i]?.locked?{...slots[i]}:{symbol:'',name:'',locked:false,origin:'auto',audit:null}),seen=new Set(next.filter(s=>s.symbol).map(s=>s.symbol));
  const accepted=[];for(const r of recommendations){if(!r.symbol||seen.has(r.symbol))continue;const i=next.findIndex(s=>!s.symbol&&!s.locked);if(i<0)break;next[i]={...next[i],...r,origin:'auto',locked:false};seen.add(r.symbol);accepted.push(r.symbol);}
  validate(next,{allowEmpty:true});const changes=[];for(let i=0;i<Math.max(slots.length,next.length);i++)if((slots[i]?.symbol??'')!==(next[i]?.symbol??''))changes.push({slot:i+1,from:slots[i]?.symbol??'',to:next[i]?.symbol??''});
  return {slots:next,changes,accepted,unfilled:next.filter(s=>!s.symbol).length};
 }
 return {MAX,resolve,validate,set,plan,fingerprint,researchSymbols,serialize,restore};
})();
if(typeof module!=='undefined')module.exports=SelectionModel;
