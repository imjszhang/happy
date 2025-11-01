#!/bin/bash
# 桌面客户端发布脚本 (Unix/macOS/Linux)
# 使用方法: ./release-desktop.sh [windows|macos|linux|all]

set -e

PLATFORM=${1:-"all"}

echo "🚀 开始发布桌面客户端..."

# 检查依赖
echo "📦 检查依赖..."
if ! command -v yarn &> /dev/null; then
    echo "❌ 未找到 yarn，请先安装 yarn"
    exit 1
fi

if ! command -v tauri &> /dev/null; then
    echo "❌ 未找到 tauri CLI，正在安装..."
    yarn add -D @tauri-apps/cli
fi

# 清理之前的构建
echo "🧹 清理之前的构建文件..."
rm -rf dist
if [ -d "src-tauri/target/release" ]; then
    echo "  清理 src-tauri/target/release..."
    rm -rf src-tauri/target/release
fi

# 根据平台构建
case $PLATFORM in
    windows)
        echo "🪟 构建 Windows 版本..."
        yarn desktop:build:windows
        ;;
    macos)
        echo "🍎 构建 macOS 版本..."
        yarn desktop:build:macos
        ;;
    linux)
        echo "🐧 构建 Linux 版本..."
        yarn desktop:build:linux
        ;;
    all)
        echo "🌍 构建所有平台版本..."
        yarn desktop:build
        ;;
    *)
        echo "❌ 无效的平台: $PLATFORM"
        echo "使用方法: ./release-desktop.sh [windows|macos|linux|all]"
        exit 1
        ;;
esac

echo ""
echo "✅ 构建完成！"
echo ""
echo "📦 构建产物位置:"
echo "   src-tauri/target/release/bundle/"
echo ""
echo "🎉 发布完成！"

