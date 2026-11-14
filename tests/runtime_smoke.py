#!/usr/bin/env python3
"""Boot the *compiled* Speed Dreams WASM build in desktop headless Chromium.

This checks actual JS/WASM initialization and the native menu, not real driving,
FPS, or mobile Safari compatibility. Writes diagnostics on every outcome.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import socket
import subprocess
import sys
import time
from contextlib import closing

from playwright.sync_api import sync_playwright

def free_port():
    with closing(socket.socket()) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--web", type=pathlib.Path, default=pathlib.Path("web"))
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("tests/runtime-evidence"))
    ap.add_argument("--timeout", type=int, default=150)
    args = ap.parse_args()
    web = args.web.resolve()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    assert (web / "app-manifest.json").is_file(), "This test requires a genuine compiled build"
    assert (web / "game/speeddreams.wasm").is_file(), "No real simulator WASM"
    port = free_port()
    address = f"http://127.0.0.1:{port}/"
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(web)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    report = {"type": "headless Chromium WASM boot smoke (NOT real-device or driving QA)", "url": address, "browser": "chromium", "booted": False, "status": [], "console_errors": [], "page_errors": [], "failed_requests": [], "response_failures": [], "elapsed_sec": None}
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=[
                "--no-sandbox", "--enable-webgl", "--enable-unsafe-swiftshader",
                "--use-gl=angle", "--use-angle=swiftshader",
            ])
            context = browser.new_context(viewport={"width": 844, "height": 390}, device_scale_factor=1, ignore_https_errors=False)
            page = context.new_page()
            page.on("console", lambda m: report["console_errors"].append(m.text[:1000]) if m.type == "error" else None)
            page.on("pageerror", lambda e: report["page_errors"].append(str(e)[:2000]))
            page.on("requestfailed", lambda req: report["failed_requests"].append({"url": req.url[:400], "failure": str(req.failure)}))
            page.on("response", lambda resp: report["response_failures"].append({"url": resp.url[:400], "status": resp.status}) if resp.status >= 400 else None)
            deadline = time.monotonic() + 10
            while True:
                try:
                    page.goto(address + "?debug=1", wait_until="domcontentloaded", timeout=5000)
                    break
                except Exception:
                    if time.monotonic() > deadline:
                        raise
                    time.sleep(0.2)
            page.wait_for_function("document.getElementById(\'start\')?.disabled === false", timeout=15000)
            page.screenshot(path=str(out / "01-loading.png"))
            page.locator("#start").click()
            start = time.monotonic()
            latest = ""
            until = start + args.timeout
            while time.monotonic() < until:
                status = page.locator("#status-text").inner_text(timeout=3000)
                if status != latest:
                    latest = status
                    report["status"].append({"elapsed_sec": round(time.monotonic()-start, 1), "text": status})
                    print(f"Loading: {latest}", flush=True)
                if page.locator("#boot").evaluate("(el) => el.hidden"):
                    report["booted"] = True
                    break
                if "エラー:" in status or page.locator("#start").inner_text().startswith("RETRY"):
                    break
                page.wait_for_timeout(400)
            report["elapsed_sec"] = round(time.monotonic() - start, 2)
            report["canvas"] = page.locator("#canvas").evaluate("(el)=>({width:el.width,height:el.height})")
            report["wasm_heap_info"] = page.evaluate("() => window.Module && window.Module.HEAPU8 ? window.Module.HEAPU8.byteLength : null")
            page.screenshot(path=str(out / "02-result.png"))
            (out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
            context.close()
            browser.close()
    except Exception as exc:
        report["exception"] = str(exc)
        (out / "report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
        print(f"BROWSER BOOT SMOKE EXCEPTION: {exc}", file=sys.stderr)
        return 1
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
    if report["booted"]:
        print("PASS: Actual WASM runtime reached its in-game UI in headless desktop Chromium; gameplay and phones UNTESTED")
        return 0
    print("FAIL: Actual WASM runtime did not reach the game interface; see report.json", file=sys.stderr)
    return 1

if __name__ == "__main__":
    raise SystemExit(main())
