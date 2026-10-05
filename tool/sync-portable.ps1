# sync-portable.ps1
# 把网页版的"可移植层"同步到小程序目录。
# 这些文件在两端内容完全一致，小程序只能打包 miniprogram/ 内的文件，所以需要一份副本。
#
#   用法：  pwsh -File tool/sync-portable.ps1
#   或者改用目录联接（Windows 下推荐，彻底免维护）：
#          Remove-Item -Recurse -Force miniprogram\js
#          mklink /J miniprogram\js js

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src  = Join-Path $root 'js'
$dst  = Join-Path $root 'miniprogram\js'

$files = @(
  'core\util.js',
  'core\i18n.js',
  'core\store.js',
  'core\audio.js',
  'core\canvas.js',
  'games\g2048.js',
  'games\match3.js',
  'games\memory.js'
)

New-Item -ItemType Directory -Force -Path (Join-Path $dst 'core')  | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $dst 'games') | Out-Null

foreach ($f in $files) {
  $from = Join-Path $src $f
  $to   = Join-Path $dst $f
  Copy-Item -LiteralPath $from -Destination $to -Force
  Write-Host "synced $f"
}

Write-Host "完成：$($files.Count) 个文件已同步到 miniprogram\js" -ForegroundColor Green
