"""Optional Playwright regression for the actual auto-to-revenue UI handoff.
Run a local server first; all data-provider requests are replaced with synthetic data.
"""
import json,os,subprocess,tempfile,shutil
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
TEST_FILES=tempfile.TemporaryDirectory(prefix='atlas-handoff-')
def fixture(count=8):
 u=json.loads(subprocess.check_output(['node','-e',f"process.stdout.write(JSON.stringify(require('./tests/auto_fixture.cjs').fixture({count})))"],cwd=ROOT))
 for i,s in enumerate(u['symbols']):s['symbol']=str(7200+i)+'.TW'
 return u
u=fixture();zero=fixture();
for s in zero['symbols']:s['revenues'][-1]['revenue']=100
files={}
for name,data in [('full',u),('zero',zero),('partial',fixture(1)),('stale',fixture(1))]:
 if name=='stale':data['symbols'][0]['symbol']='7499.TW'
 path=Path(TEST_FILES.name)/(name+'.json');path.write_text(json.dumps(data));files[name]=str(path)
requests=[]
def provider(route):
 q=parse_qs(urlparse(route.request.url).query);ds=q.get('dataset',[''])[0];code=q.get('data_id',[''])[0];requests.append((ds,code))
 if ds=='TaiwanStockInfo':rows=[{'stock_id':str(7200+i),'stock_name':'合成公司'+str(i),'industry_category':'sector'+str(i//2),'type':'twse','date':'2025-02-13'} for i in range(8)]
 elif ds=='USStockInfo':rows=[{'stock_id':'SYNUS','stock_name':'Synthetic US','Subsector':'synthetic','date':'2025-02-13'}]
 elif ds=='TaiwanStockPrice':
  src=u['benchmark'] if code=='0050' else next((s for s in u['symbols'] if s['symbol'].split('.')[0]==code),u['symbols'][0])
  rows=[{'date':r['date'],'open':r['open'],'close':r['close'],'max':r.get('high',r['close']+1),'min':r.get('low',r['close']-1),'Trading_Volume':1e7,'Trading_money':2e9} for r in src['prices']]
 elif ds=='TaiwanStockInstitutionalInvestorsBuySell':rows=[{'date':d,'name':name,'buy':100000,'sell':0} for d in u['calendar'] for name in ['Foreign_Investor','Investment_Trust']]
 elif ds=='TaiwanStockMonthRevenue':rows=[{'date':'2025-02-01','revenue_year':int(r['month'][:4]),'revenue_month':int(r['month'][5:]),'revenue':r['revenue'],'create_time':''} for r in u['symbols'][0]['revenues']]
 elif ds=='TaiwanStockFinancialStatements':rows=[{'date':'2024-'+date,'type':typ,'value':val} for date in ['03-31','06-30','09-30','12-31'] for typ,val in [('Revenue',100),('OperatingIncome',10),('IncomeAfterTaxes',8)]]
 else:rows=[{'date':'2025-01-01','value':1}]
 route.fulfill(status=200,content_type='application/json',body=json.dumps({'status':200,'data':rows}),headers={'access-control-allow-origin':'*'})
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=shutil.which('chromium') or None,headless=True,args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':1440,'height':1100});page.route('https://api.finmindtrade.com/**',provider);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.goto(os.environ.get('ATLAS_TEST_URL','http://127.0.0.1:8765'),wait_until='networkidle')
 page.locator('#tab-rev').click();page.locator('#revFile').set_input_files(files['stale'])
 # Complete late catalog metadata using company/code identity, then lock one selected stock.
 for i in range(3):page.locator('#stockSlot'+str(i)).fill(str(7200+i)+'.TW');page.locator('#stockSlot'+str(i)).press('Tab')
 page.locator('[data-slot-lock="0"]').click();initial=page.locator('[data-slot-input]').evaluate_all('(nodes)=>nodes.map(n=>n.value)')
 page.locator('#tab-auto').click();page.locator('#dataMode').select_option('historical_asof');page.locator('#asOf').fill('2025-02-13T08:30');page.locator('#targetSlots').select_option('5');page.locator('#autoFile').set_input_files(files['zero']);page.locator('#run').click()
 page.wait_for_function("document.querySelector('#run').disabled===false")
 assert page.locator('#applyRecommendations').is_disabled();assert '沒有合格推薦' in page.locator('#replacementPreview').inner_text();assert page.locator('[data-slot-input]').evaluate_all('(nodes)=>nodes.map(n=>n.value)')==initial
 print('zero recommendations: list preserved, no import offered',flush=True)
 page.locator('#autoFile').set_input_files(files['full']);page.locator('#run').click();page.wait_for_function("document.querySelector('#applyRecommendations').disabled===false")
 assert page.locator('[data-slot-input]').evaluate_all('(nodes)=>nodes.map(n=>n.value)')==initial
 page.locator('#applyRecommendations').click();assert page.locator('#tab-rev').get_attribute('aria-selected')=='true';assert page.locator('#selectionTransfer').is_visible();assert page.locator('#revFile').input_value()==''
 assert page.locator('#stockSlot0').input_value()=='7200.TW';assert page.locator('#stockSlot0').is_disabled();selected=page.locator('[data-slot-input]').evaluate_all('(nodes)=>nodes.map(n=>n.value)');assert len(selected)==5;assert '7207.TW' in selected
 assert all(s in page.locator('#selectionTransfer').inner_text() for s in selected)
 page.locator('#tab-auto').click();page.locator('#tab-rev').click();assert page.locator('[data-slot-input]').evaluate_all('(nodes)=>nodes.map(n=>n.value)')==selected
 page.reload(wait_until='networkidle');assert page.locator('#tab-rev').get_attribute('aria-selected')=='true';assert page.locator('[data-slot-input]').evaluate_all('(nodes)=>nodes.map(n=>n.value)')==selected;assert page.locator('#stockSlot0').is_disabled()
 print('positive recommendations: direct revenue handoff, lock preservation, stale source cleared, tabs and reload passed',flush=True)
 # One valid recommendation plus four blank slots must still execute research.
 page.locator('[data-slot-lock="0"]').click();page.locator('#tab-auto').click();page.locator('#autoFile').set_input_files(files['partial']);page.locator('#targetSlots').select_option('5');page.locator('#dataMode').select_option('historical_asof');page.locator('#asOf').fill('2025-02-13T08:30');page.locator('#run').click();page.wait_for_function("document.querySelector('#applyRecommendations').disabled===false");page.locator('#applyRecommendations').click()
 assert page.locator('#tab-rev').get_attribute('aria-selected')=='true';assert page.locator('#stockSlot0').input_value()=='7200.TW';assert all(page.locator('#stockSlot'+str(i)).input_value()=='' for i in range(1,5))
 page.locator('#dataMode').select_option('proxy');page.locator('#start').fill('2025-01-01');page.locator('#end').fill('2025-02-12');before=len(requests);page.locator('#run').click();page.wait_for_function("document.querySelector('#status').textContent.includes('研究完成') || document.querySelector('#status').className==='error'")
 assert '研究完成' in page.locator('#status').inner_text(),page.locator('#status').inner_text();calls=requests[before:];priceids={code for ds,code in calls if ds=='TaiwanStockPrice'};assert priceids=={'0050','7200'},priceids;assert not any(code=='7499' for ds,code in calls)
 page.set_viewport_size({'width':390,'height':844});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth');None  # Screenshots are optional; the regression uses only synthetic source data.
 assert not errors,errors
 print('partial list: research ignores blank slots, fetches selected symbol only, mobile and zero pageerrors passed',flush=True)
 browser.close()
