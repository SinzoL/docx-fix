#!/bin/bash
#
# docx-fix 一键部署脚本
# 用法: ./deploy.sh [--build-only | --sync-only]
#
# 完整流程: rsync 上传代码 → docker compose build → docker compose up -d
#

set -e

# ============ 配置区（按需修改） ============
REMOTE_USER="ubuntu"
REMOTE_HOST="43.136.17.170"
REMOTE_DIR="/home/ubuntu/docx-fix"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"  # 脚本所在目录即项目根目录

# ============ 颜色输出 ============
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

# ============ rsync 排除列表 ============
# 重要：ssl 目录中的证书由服务器管理，绝不能被 --delete 清掉
RSYNC_EXCLUDES=(
    "node_modules"
    ".git"
    "__pycache__"
    "*.pyc"
    ".DS_Store"
    ".specify"
    ".codebuddy"
    "specs"
    "frontend/src/__tests__"
    "ssl"          # ⚠️ 服务器 SSL 证书，禁止删除
    ".env"         # 环境变量文件由服务器管理
    ".ruff_cache"
)

# ============ 解析参数 ============
BUILD_ONLY=false
SYNC_ONLY=false
NO_CACHE=""

for arg in "$@"; do
    case $arg in
        --build-only)  BUILD_ONLY=true ;;
        --sync-only)   SYNC_ONLY=true ;;
        --no-cache)    NO_CACHE="--no-cache" ;;
        --help|-h)
            echo "用法: ./deploy.sh [选项]"
            echo ""
            echo "选项:"
            echo "  --sync-only   仅上传代码，不构建/重启"
            echo "  --build-only  仅构建并重启（不上传代码）"
            echo "  --no-cache    构建时不使用缓存"
            echo "  --help        显示帮助"
            exit 0
            ;;
        *) warn "未知参数: $arg" ;;
    esac
done

# ============ Step 1: 上传代码 ============
sync_code() {
    info "正在上传代码到 ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR} ..."

    # 构建 rsync 排除参数
    EXCLUDE_ARGS=()
    for item in "${RSYNC_EXCLUDES[@]}"; do
        EXCLUDE_ARGS+=(--exclude="$item")
    done

    rsync -avz --delete \
        "${EXCLUDE_ARGS[@]}" \
        -e 'ssh -o StrictHostKeyChecking=no' \
        "$LOCAL_DIR/" \
        "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

    ok "代码上传完成"
}

# ============ Step 2: 构建并重启 ============
build_and_deploy() {
    info "正在远程构建 Docker 镜像 ..."

    ssh -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" bash -s <<REMOTE_SCRIPT
        set -e
        cd ${REMOTE_DIR}

        echo ">>> 构建 backend 镜像 ..."
        docker compose build ${NO_CACHE} backend
        echo ">>> backend 构建完成 ✅"

        echo ">>> 构建 frontend 镜像 ..."
        docker compose build ${NO_CACHE} frontend
        echo ">>> frontend 构建完成 ✅"

        echo ">>> 重启所有服务 ..."
        docker compose down
        docker compose up -d

        echo ">>> 等待服务启动 ..."
        sleep 5

        echo ""
        echo "========== 容器状态 =========="
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        echo ""

        # 简单健康检查
        echo "========== 健康检查 =========="
        if curl -sf http://localhost:8000/docs > /dev/null 2>&1; then
            echo "✅ Backend API 正常"
        else
            echo "❌ Backend API 异常"
        fi

        if curl -sf http://localhost:5173/ > /dev/null 2>&1; then
            echo "✅ Frontend 正常"
        else
            echo "❌ Frontend 异常"
        fi

        if curl -sf https://localhost/ -k > /dev/null 2>&1; then
            echo "✅ Nginx HTTPS 正常"
        else
            echo "⚠️  Nginx HTTPS 未就绪（可能正在启动）"
        fi
REMOTE_SCRIPT

    ok "部署完成 🎉"
}

# ============ 执行 ============
echo ""
echo "=============================="
echo "  docx-fix 部署工具"
echo "=============================="
echo ""

if [ "$BUILD_ONLY" = true ]; then
    build_and_deploy
elif [ "$SYNC_ONLY" = true ]; then
    sync_code
else
    sync_code
    echo ""
    build_and_deploy
fi

echo ""
info "线上地址: https://www.do-not-go-to.icu/"
echo ""
