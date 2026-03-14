#!/bin/bash

# Obsidian Google Drive Sync 插件安装脚本
# 用法: ./install.sh [vault路径]

set -e

PLUGIN_ID="google-drive-sync"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- 颜色输出 ---
info()  { echo -e "\033[0;32m[INFO]\033[0m $1"; }
error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; exit 1; }

# --- 构建插件 ---
info "安装依赖..."
cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ]; then
    npm install --silent
fi

info "构建插件..."
npm run build --silent

info "构建完成"

# --- 安装到 Vault（可选） ---
VAULT_PATH="${1:-}"

if [ -z "$VAULT_PATH" ]; then
    echo ""
    echo "构建产物: manifest.json, main.js, styles.css"
    echo ""
    echo "如需安装到 Vault，请重新运行:"
    echo "  $0 <vault路径>"
    echo "  示例: $0 ~/Documents/MyVault"
    exit 0
fi

VAULT_PATH="$(cd "$VAULT_PATH" 2>/dev/null && pwd)" || error "Vault 路径不存在: $1"
OBSIDIAN_DIR="$VAULT_PATH/.obsidian"

if [ ! -d "$OBSIDIAN_DIR" ]; then
    info ".obsidian 目录不存在，自动创建"
    mkdir -p "$OBSIDIAN_DIR"
fi

PLUGIN_DIR="$OBSIDIAN_DIR/plugins/$PLUGIN_ID"
mkdir -p "$PLUGIN_DIR"

cp "$SCRIPT_DIR/manifest.json" "$PLUGIN_DIR/"
cp "$SCRIPT_DIR/main.js"       "$PLUGIN_DIR/"
cp "$SCRIPT_DIR/styles.css"    "$PLUGIN_DIR/"

info "插件已安装到 $PLUGIN_DIR"
echo ""
echo "下一步："
echo "  1. 重启 Obsidian"
echo "  2. 设置 > 第三方插件 > 启用 Google Drive Sync"
echo "  3. 配置 OAuth Client ID 和 Secret"
