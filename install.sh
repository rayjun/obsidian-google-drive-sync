#!/bin/bash

# Obsidian Google Drive Sync 插件安装脚本
# 用法: ./install.sh /path/to/vault

set -e

PLUGIN_ID="google-drive-sync"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- 颜色输出 ---
info()  { echo -e "\033[0;32m[INFO]\033[0m $1"; }
error() { echo -e "\033[0;31m[ERROR]\033[0m $1"; exit 1; }

# --- 检查 Vault 路径 ---
VAULT_PATH="${1:-}"
if [ -z "$VAULT_PATH" ]; then
    echo "用法: $0 <vault路径>"
    echo "示例: $0 ~/Documents/MyVault"
    exit 1
fi

VAULT_PATH="$(cd "$VAULT_PATH" 2>/dev/null && pwd)" || error "Vault 路径不存在: $1"
OBSIDIAN_DIR="$VAULT_PATH/.obsidian"

if [ ! -d "$OBSIDIAN_DIR" ]; then
    error "$VAULT_PATH 不是一个 Obsidian Vault（未找到 .obsidian 目录）"
fi

# --- 构建插件 ---
info "安装依赖..."
cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ]; then
    npm install --silent
fi

info "构建插件..."
npm run build --silent

# --- 安装到 Vault ---
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
