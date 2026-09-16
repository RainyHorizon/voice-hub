param(
  [string]$Version = "",
  [string]$PortableZip = "",
  [string]$IsccPath = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPackage = Get-Content (Join-Path $projectRoot "frontend\package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
if ([string]::IsNullOrWhiteSpace($Version)) { $Version = [string]$frontendPackage.version }
if ($Version -notmatch '^[0-9A-Za-z][0-9A-Za-z._-]*$') { throw "版本号格式无效。" }

$releaseRoot = Join-Path $projectRoot "output\releases"
$stageRoot = Join-Path $projectRoot "output\installer-stage"
$archive = if ($PortableZip) { Get-Item -LiteralPath $PortableZip } else {
  Get-Item -LiteralPath (Join-Path $releaseRoot "VoxNest-$Version-Windows-Portable.zip")
}
$iscc = if ($IsccPath) { $IsccPath } else {
  $candidate = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles}\Inno Setup 6\ISCC.exe"
  ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $candidate) { throw "未找到 Inno Setup 6 的 ISCC.exe。" }
  $candidate
}

if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
$extractRoot = Join-Path $stageRoot "_extract"
Expand-Archive -LiteralPath $archive.FullName -DestinationPath $extractRoot -Force
$portableRoot = Get-ChildItem -LiteralPath $extractRoot -Directory | Select-Object -First 1
if (-not $portableRoot -or -not (Test-Path (Join-Path $portableRoot.FullName "VoxNest.exe"))) {
  throw "便携包中未找到 VoxNest.exe。"
}
Get-ChildItem -LiteralPath $portableRoot.FullName -Force | Move-Item -Destination $stageRoot -Force
Remove-Item -LiteralPath $extractRoot -Recurse -Force

$iss = Join-Path $projectRoot "installer\VoxNest.iss"
& $iscc "/DVersion=$Version" "/DSourceDir=$stageRoot" $iss
if ($LASTEXITCODE -ne 0) { throw "Inno Setup 编译失败。" }
$setup = Join-Path $releaseRoot "VoxNest-$Version-Windows-Setup.exe"
if (-not (Test-Path -LiteralPath $setup)) { throw "未生成安装包：$setup" }
$hash = Get-FileHash -LiteralPath $setup -Algorithm SHA256
Set-Content -LiteralPath "$setup.sha256" -Value "$($hash.Hash)  $([IO.Path]::GetFileName($setup))" -Encoding Ascii
Remove-Item -LiteralPath $stageRoot -Recurse -Force
Write-Host "VoxNest 安装包已生成：$setup" -ForegroundColor Green
