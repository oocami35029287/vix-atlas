# VIX Atlas

VIX 波動率、布林通道與台股法人籌碼研究工具。GitHub Pages 可直接使用，沒有券商連線與自動下單。

**網站：https://oocami35029287.github.io/vix-atlas/**

## 已提供的功能

- **VIX**：保留原有 `engine.js` 日期對齊、門檻策略、績效地圖與交易明細。
- **布林通道**：20 日／2 倍母體標準差為預設，提供下軌回歸與上軌突破；收盤確認訊號，之後開盤模擬成交。計算指標使用日期篩選之前的暖機資料，暖機期間不交易。
- **籌碼研究**：S1 的 1/2/3 日、S2 的 3/5/10 日、S3 的 10/20/30 日；相同 S2 候選內比較 R1 與固定代號排序。六檔真實歷史的彙總、成本／T+2 敏感度、配對每日收益區塊重抽樣。
- **資料中心**：TWSE、TPEx、Nasdaq Trader 的現存證券目錄，台股 100 檔＋美股 100 檔人工關注清單快照；搜尋得到與可回測的資料分別顯示。
- 訊號／成交日分開、資產曲線、CSV／JSON 匯出、本機股價／籌碼包匯入、手機版及鍵盤分頁。

## 研究狀態與限制

籌碼報表是 **六檔現存股票的歷史代理研究，尚未通過策略採用門檻**。無歷史初次公布版本、完整下市母體、已證明的開盤漲跌停／可交易狀態與完整公司行為回補。原始股價未還原公司行為；代理報表不把它當成總報酬。T+2 延遲不會消除修訂偏差。這些結果不能解釋成可執行訊號、真正未接觸 OOS 或全市場優勢。

單股 VIX／布林採 Yahoo 拆股調整價格，不含現金股利再投入。允許零碎股，沒有真實委託排隊／漲跌停撮合；布林可配置賣出稅。VIX 的原版統一費率不單列台股證交稅。報酬以標的原幣計，不換匯。期末以收盤估值、不強制平倉；勝率只計完成交易。

籌碼引擎有兩種明示模式：嚴格模式拒絕缺開盤成交證據的買單，代理模式明示日線近似。新買單當日不能成交即取消，不以同一開盤替補；賣出受阻保留持倉、後續日續試。固定 h 從實際進場日起算市場交易日；最多五檔、單檔 20%、產業 40%、估計成交股數不超過先前 20 日均量 1%。賣款下一市場交易日才可重用，是研究假設而非券商交割規則。

## 本機啟動、建置與測試

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt
python build.py                       # 完全離線建置
python server.py --port 8765           # 本機查價服務
```

```bash
node test_engine.cjs
node --test tests/test_research.cjs
python -m unittest discover -s tests -p 'test_*.py'
python scripts/check_public_assets.py
```

`page.html`、`style.css`、`app.js` 為來源；`build.py` 把來源、共用引擎與預設 SPY 資料整合成 `index.html`。不要單獨編輯生成檔。`python build.py --refresh` 才會更新內建 SPY。Node 22+、Python 3.10+。

### 更新行情與目錄

```bash
python refresh_data.py --watchlist
python refresh_data.py --symbols 'TSM,AVGO,6488.TWO'
python scripts/build_catalog.py
python build.py
```

最多三個行情請求並行、失敗隔離、有限重試，成功快照原子替換，失敗保留舊版本；目前資料是每日歷史，非即時行情。目錄是現存清單，不是歷史 point-in-time 母體。快照只代表人工關注清單，不是全市場客觀排行。`data/stocks/*.json` 與共用 `data/vix.json` 分離，舊版 `data/{symbol}.json` 保持相容。

GitHub Actions 的 **Refresh market data** 可由具有 repo 權限者手動執行，也有台美市場分流排程；快照更新後自動部署 Pages。頁面本身不具 GitHub 寫入憑證。

### 私人籌碼研究

```bash
python scripts/build_chip_snapshot.py         # 原始回應只存 .private/
python scripts/run_chip_research.py           # 共用 Node 引擎，輸出衍生彙總
```

研究樣本：2330.TW、2317.TW、2454.TW、5347.TWO、5483.TWO、6488.TWO。官方／備援單位交叉比對見 `data/source_checks.json`。`--resume` 可重用本機已保存的原始回應。需要真正的版本歷史時，應使用受保護的長期儲存；臨時 CI 環境不會建立歷史首次發布證據。

FinMind 的 API 使用權不包含任意再散布原始資料；本專案只公開分析彙總，`.private/`、原始觀測及個人匯入資料都不發布。非商業研究使用；原資料機關 TWSE／TPEx、備援服務 FinMind。參考：[FinMind 資料授權](https://finmind.github.io/Disclaimer/)、[方案與使用範圍](https://finmind.github.io/Pricing/)、[TWSE 使用條款](https://www.twse.com.tw/zh/terms/use.html)、[政府資料開放授權](https://data.gov.tw/license)。網站資料集只有在適用的來源授權允許時才能作其他用途，不能把程式可抓取解釋為已取得資料再利用權。

## 主要檔案

| 功能 | 檔案 |
| --- | --- |
| 原 VIX 引擎／測試 | `engine.js`、`test_engine.cjs` |
| 布林／共用帳本 | `bb_engine.js`、`research_core.js` |
| 籌碼特徵、as-of、排序與撮合 | `chip_engine.js` |
| 可重現統計 | `research_statistics.js` |
| 官方／備援讀取 | `collectors/` |
| 正規化與版本資料契約 | `data_pipeline/`、`docs/data_contract.md` |
| 研究、更新與公開檢查 | `scripts/` |
| 單元／契約測試 | `tests/` |
| 部署與資料排程 | `.github/workflows/` |

完整雲端專案索引依 `AGENTS.md`；公開 repo 不存放私人規劃文件全文。
