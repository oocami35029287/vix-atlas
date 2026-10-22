/* Seeded whole-date block bootstrap, never treats same-day stocks as independent. */
const ResearchStatistics=(()=>{
  function bootstrap(differences,{iterations=5000,block=30,seed=20261022}={}){
    if(!Array.isArray(differences)||differences.some(x=>!Number.isFinite(x))||!Number.isInteger(iterations)||iterations<100||!Number.isInteger(block)||block<1)throw Error('Invalid bootstrap input');
    if(differences.length<block*2)return {status:'INSUFFICIENT_DATES',n:differences.length,block,iterations,seed,mean:null,ci:null,p:null};
    let state=seed>>>0;const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
    const n=differences.length,mean=differences.reduce((a,b)=>a+b,0)/n,means=[];let extremes=0;
    for(let b=0;b<iterations;b++){
      let total=0,count=0;
      while(count<n){const start=Math.floor(random()*(n-block+1));for(let j=0;j<block&&count<n;j++,count++)total+=differences[start+j];}
      const m=total/n;means.push(m);if(Math.abs(m-mean)>=Math.abs(mean))extremes++;
    }
    means.sort((a,b)=>a-b);return {status:'EXPLORATORY_ONLY',n,block,iterations,seed,mean,ci:[means[Math.floor(iterations*.025)],means[Math.floor(iterations*.975)]],p:(extremes+1)/(iterations+1)};
  }
  function holm(pvalues){const sorted=pvalues.map((p,i)=>({p,i})).sort((a,b)=>a.p-b.p),out=Array(pvalues.length);let prior=0;sorted.forEach((r,i)=>{prior=Math.max(prior,Math.min(1,r.p*(sorted.length-i)));out[r.i]=prior;});return out;}
  function pairedReturns(a,b){if(a.length!==b.length||a.some((r,i)=>r.date!==b[i].date))throw Error('Pairing requires identical dates');return a.slice(1).map((r,i)=>(r.equity/a[i].equity-1)-(b[i+1].equity/b[i].equity-1));}
  return {bootstrap,holm,pairedReturns};
})();
if(typeof module!=='undefined')module.exports=ResearchStatistics;
