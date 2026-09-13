#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""《仙途》本地静态服务器。

原生 ES Module 无法在 file:// 协议下加载（CORS 限制），
所以开发与游玩都必须通过 HTTP 协议。本脚本零依赖，只用标准库。

用法:
    python tools/serve.py [端口]
"""
import http.server
import os
import socketserver
import sys
import threading
import webbrowser
from pathlib import Path

# 控制台编码兜底：Windows 中文版的 cmd 默认是 GBK，
# 若用户把代码页切成了 UTF-8，直接 print 中文可能抛 UnicodeEncodeError 把启动搞崩。
# 这里统一改成"编不出来就替换"，宁可显示成问号也不能让游戏起不来。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PORT = 8765

# 确保 .js / .css / .svg 以正确的 MIME 类型返回，否则 ES Module 会被浏览器拒绝
EXTRA_TYPES = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".html": "text/html; charset=utf-8",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def guess_type(self, path):
        ext = Path(path).suffix.lower()
        if ext in EXTRA_TYPES:
            return EXTRA_TYPES[ext]
        return super().guess_type(path)

    def end_headers(self):
        # 开发期禁用缓存，避免改完代码刷新不生效
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        # 只报告错误，避免刷屏
        status = args[1] if len(args) > 1 else ""
        if str(status).startswith(("4", "5")):
            sys.stderr.write("  [%s] %s\n" % (status, args[0]))


def find_free_port(start):
    import socket

    for port in range(start, start + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise RuntimeError("找不到可用端口")


def main():
    start_port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    port = find_free_port(start_port)
    url = "http://127.0.0.1:%d/index.html" % port

    with socketserver.ThreadingTCPServer(("127.0.0.1", port), Handler) as httpd:
        httpd.daemon_threads = True
        print("=" * 52)
        print("  《仙途》· 文字修仙挂机")
        print("=" * 52)
        print("  服务器已启动: %s" % url)
        print("  按 Ctrl+C 停止")
        print("=" * 52)
        # 设 XIANTU_NO_BROWSER=1 可跳过自动打开浏览器（自动化测试 / 手动开浏览器时用）
        if not os.environ.get("XIANTU_NO_BROWSER"):
            threading.Timer(0.6, lambda: webbrowser.open(url)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  服务器已停止。")


if __name__ == "__main__":
    main()
