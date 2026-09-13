#!/usr/bin/env bash
# 《仙途》启动脚本（macOS / Linux）
set -e
cd "$(dirname "$0")"

if command -v python3 >/dev/null 2>&1; then
    exec python3 tools/serve.py
elif command -v python >/dev/null 2>&1; then
    exec python tools/serve.py
else
    echo "  [错误] 未检测到 Python 3，请先安装。"
    exit 1
fi
