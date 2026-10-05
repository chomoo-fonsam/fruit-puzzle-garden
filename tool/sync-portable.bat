@echo off
rem ─────────────────────────────────────────────────────────────
rem  一键同步：把网页版的"可移植层"复制到小程序目录
rem  双击运行即可。这些文件两端内容完全一致，小程序只能打包
rem  miniprogram/ 内的文件，所以需要一份副本。
rem ─────────────────────────────────────────────────────────────
setlocal
set ROOT=%~dp0..
set SRC=%ROOT%\js
set DST=%ROOT%\miniprogram\js

if not exist "%SRC%" (
  echo [错误] 找不到网页版目录：%SRC%
  pause
  exit /b 1
)

if not exist "%DST%\core"  mkdir "%DST%\core"
if not exist "%DST%\games" mkdir "%DST%\games"

copy /Y "%SRC%\core\util.js"    "%DST%\core\util.js"    >nul
copy /Y "%SRC%\core\i18n.js"    "%DST%\core\i18n.js"    >nul
copy /Y "%SRC%\core\store.js"   "%DST%\core\store.js"   >nul
copy /Y "%SRC%\core\audio.js"   "%DST%\core\audio.js"   >nul
copy /Y "%SRC%\core\canvas.js"  "%DST%\core\canvas.js"  >nul
copy /Y "%SRC%\games\g2048.js"  "%DST%\games\g2048.js"  >nul
copy /Y "%SRC%\games\match3.js" "%DST%\games\match3.js" >nul
copy /Y "%SRC%\games\memory.js" "%DST%\games\memory.js" >nul

echo.
echo 同步完成：8 个文件已复制到 miniprogram\js
echo.
pause
