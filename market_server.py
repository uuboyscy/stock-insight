#!/usr/bin/env python3
"""Pulse market dashboard server.

Serves the single-page app and a small read-only API. Historical Taiwan stock
prices come from the Taiwan Stock Exchange's public reports. When upstream
services are unavailable, the browser keeps its clearly-labelled demo snapshot.
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent
SYMBOLS = ("2330", "2317", "2454", "2382")
CACHE_TTL_SECONDS = 15 * 60
USER_AGENT = "PulseMarketDashboard/1.0 (educational research dashboard)"
cache_lock = threading.Lock()
dashboard_cache: dict[str, Any] = {"time": 0.0, "payload": None}


def fetch_json(url: str, timeout: int = 6) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_text(url: str, timeout: int = 6) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml,text/xml"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode("utf-8", errors="replace")


def month_keys(count: int = 7) -> list[str]:
    now = datetime.now()
    year, month = now.year, now.month
    keys: list[str] = []
    for _ in range(count):
        keys.append(f"{year:04d}{month:02d}01")
        month -= 1
        if month == 0:
            year -= 1
            month = 12
    return list(reversed(keys))


def roc_to_iso(value: str) -> str | None:
    match = re.match(r"(\d{2,3})/(\d{1,2})/(\d{1,2})", value.strip())
    if not match:
        return None
    year, month, day = map(int, match.groups())
    return f"{year + 1911:04d}-{month:02d}-{day:02d}"


def numeric(value: Any) -> float | None:
    try:
        cleaned = str(value).replace(",", "").replace("--", "").strip()
        return float(cleaned) if cleaned else None
    except (TypeError, ValueError):
        return None


def fetch_stock_history(symbol: str) -> dict[str, Any] | None:
    points: dict[str, float] = {}
    for month in month_keys():
        query = urllib.parse.urlencode({"response": "json", "date": month, "stockNo": symbol})
        url = f"https://www.twse.com.tw/exchangeReport/STOCK_DAY?{query}"
        try:
            payload = fetch_json(url)
        except (OSError, ValueError, urllib.error.URLError):
            continue
        for row in payload.get("data", []):
            if len(row) < 7:
                continue
            date = roc_to_iso(str(row[0]))
            close = numeric(row[6])
            if date and close and close > 0:
                points[date] = close
    history = [{"date": date, "close": close} for date, close in sorted(points.items())]
    if len(history) < 35:
        return None
    return {"symbol": symbol, "history": history[-145:], "source": "TWSE"}


def fetch_taiex_history() -> dict[str, Any] | None:
    rows: dict[str, float] = {}
    for month in month_keys(2):
        query = urllib.parse.urlencode({"response": "json", "date": month})
        url = f"https://www.twse.com.tw/exchangeReport/FMTQIK?{query}"
        try:
            payload = fetch_json(url)
        except (OSError, ValueError, urllib.error.URLError):
            continue
        for row in payload.get("data", []):
            if len(row) < 6:
                continue
            date = roc_to_iso(str(row[0]))
            index_value = numeric(row[4])
            if date and index_value:
                rows[date] = index_value
    values = [value for _, value in sorted(rows.items())]
    if len(values) < 2:
        return None
    change = (values[-1] / values[-2] - 1) * 100
    normalized = [round(value / values[0] * 100, 3) for value in values[-15:]]
    return {"value": values[-1], "change": change, "data": normalized, "state": "偏多" if change > 0 else "偏弱"}


def plain_text(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html or "")).strip()


def news_category(title: str) -> str:
    if re.search(r"台灣|台股|Taiwan|TWSE", title, re.I):
        return "tw"
    if re.search(r"晶片|半導體|伺服器|供應鏈|chip|semiconductor|server|supply", title, re.I):
        return "supply"
    return "world"


def fetch_news_feed(query: str, limit: int = 5) -> list[dict[str, Any]]:
    params = urllib.parse.urlencode({"q": query, "hl": "zh-TW", "gl": "TW", "ceid": "TW:zh-Hant"})
    xml = fetch_text(f"https://news.google.com/rss/search?{params}")
    root = ET.fromstring(xml)
    results: list[dict[str, Any]] = []
    for item in root.findall("./channel/item")[:limit]:
        title = plain_text(item.findtext("title", default="市場快訊"))
        link = item.findtext("link", default="")
        source = item.findtext("source", default="Google News")
        published = item.findtext("pubDate", default="")
        time_label = "近期"
        if published:
            try:
                published_at = parsedate_to_datetime(published)
                now = datetime.now(timezone.utc)
                hours = max(0, int((now - published_at.astimezone(timezone.utc)).total_seconds() / 3600))
                time_label = f"{hours} 小時前" if hours < 24 else f"{hours // 24} 天前"
            except (TypeError, ValueError):
                pass
        results.append({
            "title": title,
            "url": link,
            "source": source,
            "time": time_label,
            "category": news_category(title),
        })
    return results


def fetch_news() -> list[dict[str, Any]]:
    queries = ("台股 半導體 供應鏈", "全球 經濟 科技 股市")
    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(fetch_news_feed, query) for query in queries]
        for future in futures:
            try:
                results.extend(future.result())
            except (OSError, ValueError, ET.ParseError, urllib.error.URLError):
                continue
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for row in results:
        key = row["title"].lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(row)
    return unique[:9]


def build_dashboard() -> dict[str, Any]:
    stocks: dict[str, Any] = {}
    with ThreadPoolExecutor(max_workers=len(SYMBOLS) + 2) as executor:
        stock_futures = {symbol: executor.submit(fetch_stock_history, symbol) for symbol in SYMBOLS}
        taiex_future = executor.submit(fetch_taiex_history)
        news_future = executor.submit(fetch_news)
        for symbol, future in stock_futures.items():
            try:
                result = future.result()
                if result:
                    stocks[symbol] = result
            except Exception:
                continue
        try:
            taiex = taiex_future.result()
        except Exception:
            taiex = None
        try:
            news = news_future.result()
        except Exception:
            news = []

    payload: dict[str, Any] = {
        "mode": "live" if stocks else "demo",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "stocks": stocks,
        "news": news,
        "sources": {
            "prices": "Taiwan Stock Exchange public historical reports",
            "news": "Google News public RSS aggregation",
        },
    }
    if taiex:
        payload["markets"] = {"taiex": taiex}
    return payload


def dashboard_payload(force: bool = False) -> dict[str, Any]:
    with cache_lock:
        fresh = time.time() - dashboard_cache["time"] < CACHE_TTL_SECONDS
        if dashboard_cache["payload"] is not None and fresh and not force:
            return dashboard_cache["payload"]
    payload = build_dashboard()
    with cache_lock:
        dashboard_cache["payload"] = payload
        dashboard_cache["time"] = time.time()
    return payload


class PulseHandler(BaseHTTPRequestHandler):
    server_version = "PulseMarket/1.0"

    def do_GET(self) -> None:  # noqa: N802
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/health":
            self.send_json({"ok": True, "time": datetime.now(timezone.utc).isoformat()})
            return
        if parsed.path == "/api/dashboard":
            params = urllib.parse.parse_qs(parsed.query)
            try:
                self.send_json(dashboard_payload(force=params.get("refresh") == ["1"]))
            except Exception as error:
                self.send_json({"mode": "demo", "updated_at": datetime.now(timezone.utc).isoformat(), "error": str(error)}, HTTPStatus.OK)
            return
        self.serve_static(parsed.path)

    def send_json(self, payload: Any, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def serve_static(self, path: str) -> None:
        relative = "index.html" if path in ("", "/") else urllib.parse.unquote(path.lstrip("/"))
        candidate = (ROOT / relative).resolve()
        if ROOT not in candidate.parents and candidate != ROOT:
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if not candidate.is_file() or candidate.name.startswith(".") or candidate.suffix in {".py", ".sh"}:
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content = candidate.read_bytes()
        mime, _ = mimetypes.guess_type(candidate.name)
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{mime or 'application/octet-stream'}; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def log_message(self, fmt: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the Pulse market dashboard")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), PulseHandler)
    print(f"Pulse is running at http://{args.host}:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
