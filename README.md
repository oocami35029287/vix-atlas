# VIX Atlas

HTML 買賣點地圖與回測系統。資料：Yahoo Finance 日線、Cboe VIX 歷史值。

## 開啟

環境已安裝 requests；在本工作區執行：

```bash
cd /workspace/stock-prices/vix-lab
../.venv/bin/python server.py --port 8765
```

若下載到其他電腦，先安裝 Python 3.10+，執行 `python -m pip install -r requirements.txt`，再執行 `python server.py`。

瀏覽器開啟 http://localhost:8765 。輸入 SPY、AAPL、NVDA、2330.TW 或 6488.TWO 等 Yahoo Finance 支援代號。僅接受紐約及台北時區交易所。查價受資料來源可用性與限流約束；不是所有代號都有完整歷史。

直接開啟 `index.html` 也可使用內建的 SPY 真實資料與門檻地圖。離線模式需匯入其他股票資料 JSON；查詢任意代號必須啟動上述服務。HTML 及匯入資料均在瀏覽器計算，沒有交易下單功能。

## 策略與限制

- VIX 高於買入門檻時空手全額買入，低於賣出門檻時全額賣出。買入門檻必須高於賣出門檻。
- 每個交易日開盤僅使用日期嚴格早於當日的最新 VIX 收盤值；超過七個日曆日未更新便不產生新交易。這同時避免美股及台股的當日收盤前視偏差。
- 依開盤成交並扣滑價、費用。允許零碎股；沒有加碼、放空、槓桿、現金利息、交易單位或漲跌停限制。
- 使用 Yahoo 拆股調整日線；未計入股利再投入。若採不同還原權息資料，績效不會相同。
- 期末持倉按最後收盤估值，不強制賣出，不計假設平倉成本；勝率只計完整交易。買入持有採相同起始開盤與買入成本。
- 報酬以標的原幣計，不換匯。費用為統一單邊費率，台股賣出交易稅未單獨建模。
- 門檻地圖是樣本內比較，並非樣本外驗證；不應把最高報酬格子當作未來獲利保證。
- VIX 是 S&P 500 預期波動率；用於台股代表跨市場訊號，不是台股個別標的的波動率。
- 系統排除交易所當日可能尚未完整公布的行情；資料快取保留到服務重啟。

## 檔案與驗證

- `index.html`：完整單檔介面，包含真實 SPY 資料。
- `page.html`、`engine.js`：介面與回測引擎原始碼。
- `server.py`：本機行情代理；不需要 API Key。預設綁定所有網路介面，僅建議在自己的可信環境執行。
- `sample.json`：內建真實資料，可作為 JSON 匯入格式範本。
- `build.py`：更新 SPY 預設行情並重建 HTML（程式內可調日期）。
- `test_engine.cjs`：驗證前視偏差、成交價、費用、無交易、期末持倉與過期 VIX。

```bash
node test_engine.cjs
../.venv/bin/python build.py
```

## GitHub Pages

預定 Pages 網址（須先建立儲存庫並成功部署）：https://oocami35029287.github.io/vix-atlas/

Pages 只能執行靜態網頁，因此使用 `data/代號.json` 歷史行情快照。預建 SPY、QQQ、AAPL、NVDA、MSFT、TSLA、AMD、2330.TW、2317.TW、2454.TW，自 2020 年起。選擇的日期會在瀏覽器篩選；晚於快照最新日的日期不會產生額外行情。

### 新增任意支援代號

1. 開啟儲存庫的 **Actions → Refresh market data → Run workflow**。
2. 在 `symbols` 填入代號，以逗號分隔，例如 `TSM,AVGO,6488.TWO`，最多 30 個。
3. 執行後會下載真實行情、提交 JSON，並觸發 Pages 自動部署。成功後回到網頁輸入代號。

資料來源仍限 Yahoo Finance 支援的美國及台灣市場。無法保證所有代號均有完整資料。頁面也支援 JSON 匯入，或在本機使用 Python 查價服務。

預設十檔會在每個平日 UTC 23:30 排程更新。GitHub 排程可能延後；新增的其他股票可再手動更新，或修改工作流程預設名單納入排程。資料取得失敗會讓更新工作失敗，網站保留既有快照。

`Deploy GitHub Pages` 工作流程只發布 HTML 與 data 資料夾，Python 服務不會在 Pages 執行。任何人可以瀏覽公開網站，但只有具有儲存庫權限者可以執行資料更新工作。
