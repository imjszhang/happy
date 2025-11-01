# 桌面客户端发布脚本 (Windows PowerShell)
# 使用方法: .\release-desktop.ps1 [windows|macos|linux|all]

param(
    [Parameter(Position=0)]
    [ValidateSet("windows", "macos", "linux", "all")]
    [string]$Platform = "all"
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 开始发布桌面客户端..." -ForegroundColor Cyan

# 检查依赖
Write-Host "📦 检查依赖..." -ForegroundColor Yellow
if (-not (Get-Command yarn -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 yarn，请先安装 yarn" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command tauri -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 tauri CLI，正在安装..." -ForegroundColor Yellow
    yarn add -D @tauri-apps/cli
}

# 清理之前的构建
Write-Host "🧹 清理之前的构建文件..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}
if (Test-Path "src-tauri/target/release") {
    Write-Host "  清理 src-tauri/target/release..." -ForegroundColor Gray
    Remove-Item -Recurse -Force "src-tauri/target/release"
}

# 根据平台构建
switch ($Platform) {
    "windows" {
        Write-Host "🪟 构建 Windows 版本..." -ForegroundColor Green
        yarn desktop:build:windows
    }
    "macos" {
        Write-Host "🍎 构建 macOS 版本..." -ForegroundColor Green
        yarn desktop:build:macos
    }
    "linux" {
        Write-Host "🐧 构建 Linux 版本..." -ForegroundColor Green
        yarn desktop:build:linux
    }
    "all" {
        Write-Host "🌍 构建所有平台版本..." -ForegroundColor Green
        yarn desktop:build
    }
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 构建失败！" -ForegroundColor Red
    exit 1
}

Write-Host "✅ 构建完成！" -ForegroundColor Green
Write-Host ""
Write-Host "📦 构建产物位置:" -ForegroundColor Cyan
Write-Host "   src-tauri/target/release/bundle/" -ForegroundColor Gray
Write-Host ""
Write-Host "🎉 发布完成！" -ForegroundColor Green

