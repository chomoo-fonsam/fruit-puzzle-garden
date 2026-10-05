@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title 果园谜题 · 发布到 GitHub

rem ══════════════════════════════════════════════════════════════
rem  用法（在本目录下）：
rem      publish.bat                          ← 双击运行，会提示你输入仓库地址
rem      publish.bat -Repo <仓库地址>          ← 命令行直接带地址
rem      publish.bat -Repo <地址> -Message "fix: 修个 bug"
rem
rem  说明：Windows 自带的 PowerShell 5.1 没有 pwsh 命令，
rem        本脚本会自动挑选可用的 powershell.exe / pwsh.exe。
rem ══════════════════════════════════════════════════════════════

set REPO=
set BRANCH=
set MESSAGE=

:parse
if "%~1"=="" goto start
if /I "%~1"=="-Repo"    ( set REPO=%~2   & shift & shift & goto parse )
if /I "%~1"=="-Branch"  ( set BRANCH=%~2 & shift & shift & goto parse )
if /I "%~1"=="-Message" ( set MESSAGE=%~2 & shift & shift & goto parse )
if /I "%~1"=="-h"       goto help
if /I "%~1"=="--help"   goto help
shift
goto parse

:help
echo.
echo   用法：publish.bat [-Repo 仓库地址] [-Branch 分支] [-Message 提交信息]
echo   示例：publish.bat -Repo https://github.com/你的用户名/fruit-puzzle-garden.git
echo.
pause
exit /b 0

:start
echo.
echo ==============================================
echo   果园谜题 · 发布到 GitHub
echo ==============================================
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [缺少] 没有找到 git 命令。
  echo        请先安装 Git for Windows：https://git-scm.com/download/win
  echo        安装时保持默认选项即可，装完重新打开本窗口再试。
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%i in ('git --version') do echo   已检测到 %%i

if "%REPO%"=="" (
  echo.
  echo   请粘贴你的 GitHub 仓库地址，例如：
  echo   https://github.com/chomoo-fonsam/fruit-puzzle-garden.git
  echo.
  set /p REPO=  仓库地址: 
)

if "%REPO%"=="" (
  echo.
  echo [取消] 没有提供仓库地址。
  pause
  exit /b 1
)

set SCRIPT=%~dp0tool\publish.ps1
if not exist "%SCRIPT%" (
  echo [错误] 找不到脚本：%SCRIPT%
  pause
  exit /b 1
)

rem 优先用 PowerShell 7（pwsh），没有就用系统自带的 powershell
set PSEXE=
for %%p in (pwsh.exe) do if not defined PSEXE if exist "%%~$PATH:p" set PSEXE=%%~$PATH:p
if not defined PSEXE (
  for %%p in ("%ProgramFiles%\PowerShell\7\pwsh.exe") do if not defined PSEXE if exist %%p set PSEXE=%%~p
)
if not defined PSEXE set PSEXE=powershell.exe

set ARGS=-NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%" -Repo "%REPO%"
if not "%BRANCH%"==""  set ARGS=%ARGS% -Branch "%BRANCH%"
if not "%MESSAGE%"=="" set ARGS=%ARGS% -Message "%MESSAGE%"

echo.
echo   使用解释器：%PSEXE%
echo.

"%PSEXE%" %ARGS%
set CODE=%ERRORLEVEL%

echo.
if not "%CODE%"=="0" (
  echo [失败] 退出码 %CODE%，请把上面的报错内容发给开发者。
) else (
  echo [完成] 别忘了去仓库 Settings -^> Pages 开启 GitHub Pages。
)
echo.
pause
exit /b %CODE%
