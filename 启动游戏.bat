@echo off
cd /d "%~dp0"

echo.
echo   ============================================
echo     《仙途》· 文字修仙挂机
echo   ============================================
echo.

where python >nul 2>nul
if %errorlevel%==0 goto usepython

where py >nul 2>nul
if %errorlevel%==0 goto usepy

echo   [错误] 未检测到 Python。
echo.
echo   本游戏需要一个本地服务器才能运行（浏览器不允许直接打开本地模块文件）。
echo   请先安装 Python 3.8 或更高版本：
echo       https://www.python.org/downloads/
echo   安装时务必勾选 "Add Python to PATH"。
echo.
pause
goto end

:usepython
python "tools\serve.py"
goto end

:usepy
py "tools\serve.py"
goto end

:end
