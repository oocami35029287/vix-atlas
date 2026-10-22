/* The browser and CLI execute the same pure JS signal/accounting implementation. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const E=require('../chip_engine.js'),S=require('../research_statistics.js');
const root=path.join(__dirname,'..'),input=process.argv[2]||path.join(root,'.private/chip_universe.json'),raw=fs.readFileSync(input),universe=JSON.parse(raw);
const sha=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const dirty=Boolean(cp.execFileSync('git',['status','--porcelain','--untracked-files=all','--','chip_engine.js','research_core.js','research_statistics.js','scripts/run_chip_research.cjs'],{cwd:root,encoding:'utf8'}).trim());
const options={availability:'proxy',execution:'daily-proxy',cache:true,capital:1000000,fee:.001425,tax:.003,minFee:20,lot:1000,slip:.0005,start:'2020-01-01',end:universe.calendar.at(-1)};
const runs=[];
function compact(r){return {total:r.total,cagr:r.cagr,mdd:r.mdd,sharpe:r.sharpe,end:r.end,winRate:r.winRate,completed:r.trades.length,pending:r.positions.length,signals:r.signals.length,rejected:r.orderEvents.filter(e=>e.status==='CANCELLED').length,blockedExits:r.orderEvents.filter(e=>e.status==='BLOCKED').length,exposure:r.exposure};}
let baseline,ranked;
for(const [strategy,hs] of Object.entries(E.horizons))for(const holding of hs){
 const config={...options,strategy,holding,ranking:'symbol'},r=E.simulatePortfolio(universe,config),events=E.eventStudy(universe,config);
 const sensitivity={};for(const slip of [.0015,.003])sensitivity['slip_'+slip]=compact(E.simulatePortfolio(universe,{...config,slip}));
 sensitivity.delay2=compact(E.simulatePortfolio(universe,{...config,delay:2}));
 runs.push({id:strategy+'-h'+holding,strategy,holding,configuration:config,metrics:compact(r),eventStudy:{count:events.count,completed:events.completed,signalDates:events.signalDates,mean:events.mean,median:events.median},sensitivity,curve:r.curve});
 if(strategy==='S2'&&holding===5)baseline=r;
 console.log(strategy,holding,r.trades.length,'completed');
}
ranked=E.simulatePortfolio(universe,{...options,strategy:'S2',holding:5,ranking:'R1'});
const differences=S.pairedReturns(ranked.curve,baseline.curve),statistics=[30,60].map(block=>S.bootstrap(differences,{block}));
const adjusted=S.holm(statistics.map(r=>r.p??1));statistics.forEach((r,i)=>r.holmAdjustedP=adjusted[i]);
const sourceHashes=Object.fromEntries(['chip_engine.js','research_core.js','research_statistics.js','scripts/run_chip_research.cjs'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')]));
const report={schema_version:'1.3',published_at:new Date().toISOString(),report_type:'six-stock proxy research; not adopted trading signals',source:'FinMind; original providers TWSE/TPEx',raw_data_included:false,manifest:{git_sha:dirty?null:sha,base_git_sha:sha,source_state:dirty?'working-tree content identified by source_hashes':'committed',source_hashes:sourceHashes,spec_version:'1.3',engine_hash:sourceHashes['chip_engine.js'],dataset_hash:crypto.createHash('sha256').update(raw).digest('hex'),universe:universe.symbols.map(s=>({symbol:s.symbol,name:s.name,industry:s.industry})),universe_basis:universe.universe_basis,calendar_hash:crypto.createHash('sha256').update(JSON.stringify(universe.calendar)).digest('hex'),as_of:new Date().toISOString(),options,statistical_seed:20261022},range:[universe.calendar[0],universe.calendar.at(-1)],gates:{G0:false,G1:'synthetic tests passed; historical data validation incomplete',G2:false,G3:false},limitations:['Latest historical revisions; no first-publication evidence','Six current-survivor stocks; not a full-market selection test','Raw unadjusted prices; corporate actions and dividends not reconstructed','Daily proxy assumes opens executable; no opening-limit evidence','No untouched out-of-sample adoption test'],runs,ranking:{id:'R1-S2-v1.3-h5',metrics:compact(ranked),curve:ranked.curve,statistics,matchedBaseline:'S2-h5',latestSignalDate:ranked.signals.at(-1)?.signalDate??null,latestCandidates:ranked.signals.filter(s=>s.signalDate===ranked.signals.at(-1)?.signalDate).map(s=>({symbol:s.symbol,signalDate:s.signalDate,executionDate:s.executionDate,score:s.score,rank:s.rank}))}};
const destination=path.join(root,'data/chip_report.json'),temp=destination+'.tmp';fs.writeFileSync(temp,JSON.stringify(report));fs.renameSync(temp,destination);console.log('Published aggregated research report; raw observations withheld');
