"""Local VIX lab: market data proxy and static files, no credentials required."""
import csv
from datetime import date, datetime, timezone
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import io
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urlparse
import requests

ROOT = Path(__file__).resolve().parent


@lru_cache(maxsize=64)
def load_data(symbol, start, end):
    start_date, end_date = date.fromisoformat(start), date.fromisoformat(end)
    if start_date >= end_date or end_date > date.today():
        raise ValueError("請選擇有效的起訖日期，結束日期不可晚於今天。")
    if not re.fullmatch(r"[A-Z0-9.^=-]{1,24}", symbol):
        raise ValueError("股票代號格式不正確")
    if symbol.isdigit():
        symbol += ".TW"
    p1 = int(datetime.combine(start_date, datetime.min.time(), timezone.utc).timestamp())
    p2 = int(datetime.combine(end_date, datetime.max.time(), timezone.utc).timestamp())
    response = requests.get(
        f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}",
        params={"period1": p1, "period2": p2, "interval": "1d"},
        headers={"User-Agent": "Mozilla/5.0"}, timeout=25)
    if not response.ok:
        raise ValueError(f"行情供應商回應 HTTP {response.status_code}；請確認代號或稍後重試。")
    chart = response.json().get("chart", {})
    if not chart.get("result"):
        raise ValueError("找不到股票行情，請確認代號（例 AAPL、2330.TW、6488.TWO）。")
    result = chart["result"][0]
    meta = result["meta"]
    if meta.get("exchangeTimezoneName") not in ("America/New_York", "Asia/Taipei"):
        raise ValueError("目前僅支援美國紐約時區及台灣交易所，其他市場需另行校準交易時差。")
    quote = result["indicators"]["quote"][0]
    from zoneinfo import ZoneInfo
    zone = ZoneInfo(meta["exchangeTimezoneName"])
    prices = []
    invalid = 0
    for i, stamp in enumerate(result.get("timestamp", [])):
        day = datetime.fromtimestamp(stamp, zone).date().isoformat()
        op, cl = quote["open"][i], quote["close"][i]
        if not (op and cl and op > 0 and cl > 0):
            invalid += 1
            continue
        # Exclude the current exchange day: its final daily close may not be published.
        if start <= day <= end and day < datetime.now(zone).date().isoformat():
            prices.append({"date": day, "open": op, "close": cl})
    vix_response = requests.get("https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv", timeout=25)
    vix_response.raise_for_status()
    vix = []
    for row in csv.DictReader(io.StringIO(vix_response.text.lstrip("\ufeff"))):
        day = datetime.strptime(row["DATE"], "%m/%d/%Y").date().isoformat()
        if day <= end:
            vix.append({"date": day, "close": float(row["CLOSE"])})
    if len(prices) < 2:
        raise ValueError("所選期間有效股價不足兩筆。")
    return {"symbol": symbol, "currency": meta.get("currency", ""),
            "name": meta.get("shortName", symbol), "prices": sorted(prices, key=lambda r:r["date"]),
            "vix": sorted(vix, key=lambda r:r["date"]), "invalid": invalid,
            "source": "Yahoo Finance / Cboe", "fetchedAt": datetime.now(timezone.utc).isoformat()}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path != "/api/data":
            return super().do_GET()
        try:
            query = parse_qs(url.query)
            result = load_data(query.get("symbol", ["SPY"])[0].upper().strip(),
                               query.get("start", ["2020-01-01"])[0],
                               query.get("end", [date.today().isoformat()])[0])
            body, status = json.dumps(result).encode(), 200
        except (ValueError, KeyError, requests.RequestException) as exc:
            message = str(exc) if isinstance(exc, ValueError) else "資料服務暫時無法連線或回傳格式異常，請稍後重試。"
            body, status = json.dumps({"error": message}).encode(), 400
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    print(f"VIX Lab: http://localhost:{args.port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()
