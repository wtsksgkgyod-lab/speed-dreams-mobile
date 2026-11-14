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

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

def free_port():
    with closing(socket.socket()) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--web", type=pathlib.Path, default=pathlib.Path("web"))
    ap.add_argument("--out", type=pathlib.Path, default=pathlib.Path("tests/runtime-evidence"))
    ap.add_argument("--timeout", type=int, default=210)
    ap.add_argument("--mode", choices=("menu","quickrace"), default="quickrace")
    args = ap.parse_args()
    web = args.web.resolve()
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    assert (web / "app-manifest.json").is_file(), "This test requires a genuine compiled build"
    assert (web / "game/speeddreams.wasm").is_file(), "No real simulator WASM"
    port = free_port()
    address = f"http://127.0.0.1:{port}/"
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(web)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    report = {"type": "headless Chromium WASM boot smoke (NOT real-device or driving QA)", "url": address, "browser": "chromium", "booted": False, "status": [], "console_errors": [], "page_errors": [], "failed_requests": [], "response_failures": [], "elapsed_sec": None, "mode": args.mode, "throttle_probe_max_kph": None}
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
            button_id = "quick-race" if args.mode == "quickrace" else "start"
            page.wait_for_function("(id) => document.getElementById(id)?.disabled === false", arg=button_id, timeout=15000)
            page.screenshot(path=str(out / "01-loading.png"))
            page.locator("#" + button_id).click()
            start = time.monotonic()
            latest = ""
            until = start + args.timeout
            last_heartbeat = start
            while time.monotonic() < until:
                # Large WebAssembly initialization and thousands of ZIP entries
                # may occupy the renderer for several seconds. A single DOM
                # read timeout must not be mistaken for a failed engine boot.
                try:
                    status = page.locator("#status-text").inner_text(timeout=12000)
                    if status != latest:
                        latest = status
                        report["status"].append({"elapsed_sec": round(time.monotonic()-start, 1), "text": status})
                        print(f"Loading: {latest}", flush=True)
                    if page.locator("#boot").evaluate("(el) => el.hidden", timeout=12000):
                        report["booted"] = True
                        break
                    if "エラー:" in status or page.locator("#start").inner_text(timeout=12000).startswith("RETRY"):
                        break
                except PlaywrightTimeoutError:
                    if time.monotonic()-last_heartbeat >= 10:
                        last_heartbeat=time.monotonic()
                        print(f"Renderer busy after {round(last_heartbeat-start,1)}s; still probing actual WASM boot", flush=True)
                    if page.is_closed():
                        report["page_closed"] = True
                        break
                    continue
                page.wait_for_timeout(450)
            report["elapsed_sec"] = round(time.monotonic() - start, 2)
            report["canvas"] = page.locator("#canvas").evaluate("(el)=>({width:el.width,height:el.height})")
            report["wasm_heap_info"] = page.evaluate("() => window.Module && window.Module.HEAPU8 ? window.Module.HEAPU8.byteLength : null")
            page.screenshot(path=str(out / "02-result.png"), timeout=25000)
            if report["booted"] and args.mode == "quickrace":
                # Probe vehicle response with a held virtual throttle. Software
                # renderer timing can make this inconclusive; it is not a lap test.
                page.wait_for_timeout(12000)
                pedal = page.locator("#throttle")
                if pedal.is_visible():
                    rect = pedal.bounding_box()
                    if rect:
                        page.mouse.move(rect["x"] + rect["width"]/2, rect["y"] + rect["height"]*.1)
                        page.mouse.down()
                        top_speed = 0
                        try:
                            for _ in range(22):
                                page.wait_for_timeout(500)
                                raw = page.locator("#speed").inner_text()
                                try: top_speed=max(top_speed, int(raw))
                                except ValueError: pass
                        finally:
                            page.mouse.up()
                        report["throttle_probe_max_kph"] = top_speed
                        print(f"Headless throttle probe max speed: {top_speed} km/h (not a lap test)", flush=True)
                        page.screenshot(path=str(out / "03-after-throttle.png"))
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
