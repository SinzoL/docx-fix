#!/bin/bash
#
# docx-fix 一键部署脚本
# 用法: ./deploy.sh [选项]
#
# 完整流程: 本地 git push → 远程 git pull → docker compose build → docker compose up -d
#

set -e

# ============ 配置区（按需修改） ============
REMOTE_USER="ubuntu"
REMOTE_HOST="43.136.17.170"
REMOTE_DIR="/home/ubuntu/docx-fix"
GIT_REPO="git@github.com:SinzoL/docx-fix.git"
GIT_BRANCH="main"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"  # 脚本所在目录即项目根目录

# SSH 连接方式（支持密码和密钥两种）
# 若设置了 DEPLOY_PASS 环境变量或 --password 参数，则使用 sshpass
SSH_PASS=""
SSH_CMD=""

setup_ssh() {
    if [ -n "$SSH_PASS" ]; then
        if ! command -v sshpass &>/dev/null; then
            fail "需要 sshpass 工具。安装: brew install hudochenkov/sshpass/sshpass (macOS) 或 apt install sshpass (Linux)"
        fi
        SSH_CMD="sshpass -p '${SSH_PASS}' ssh -o StrictHostKeyChecking=no"
    else
        SSH_CMD="ssh -o StrictHostKeyChecking=no"
    fi
}

remote_exec() {
    if [ -n "$SSH_PASS" ]; then
        sshpass -p "${SSH_PASS}" ssh -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" bash -s
    else
        ssh -o StrictHostKeyChecking=no "${REMOTE_USER}@${REMOTE_HOST}" bash -s
    fi
}

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

# ============ 解析参数 ============
BUILD_ONLY=false
PUSH_ONLY=false
PULL_ONLY=false
NO_CACHE=""
SKIP_PUSH=false
COMMIT_MSG=""

# 从环境变量读取密码（如果有）
SSH_PASS="${DEPLOY_PASS:-}"

for arg in "$@"; do
    case $arg in
        --build-only)  BUILD_ONLY=true ;;
        --push-only)   PUSH_ONLY=true ;;
        --pull-only)   PULL_ONLY=true ;;
        --no-cache)    NO_CACHE="--no-cache" ;;
        --skip-push)   SKIP_PUSH=true ;;
        --password=*)  SSH_PASS="${arg#--password=}"; warn "在命令行中传递密码不安全（会留在 shell history 中），建议使用 DEPLOY_PASS 环境变量" ;;
        -p=*)          SSH_PASS="${arg#-p=}"; warn "在命令行中传递密码不安全（会留在 shell history 中），建议使用 DEPLOY_PASS 环境变量" ;;
        -m=*)          COMMIT_MSG="${arg#-m=}" ;;
        --message=*)   COMMIT_MSG="${arg#--message=}" ;;
        --help|-h)
            echo "用法: ./deploy.sh [选项]"
            echo ""
            echo "选项:"
            echo "  (无参数)      完整流程: push → pull → build → deploy"
            echo "  --push-only   仅推送本地代码到 GitHub"
            echo "  --pull-only   仅在远程服务器拉取最新代码"
            echo "  --build-only  仅在远程构建并重启（不推送/拉取）"
            echo "  --skip-push   跳过本地推送，直接从远程拉取并部署"
            echo "  --no-cache    Docker 构建时不使用缓存"
            echo "  --password=XX 服务器 SSH 密码（也可设 DEPLOY_PASS 环境变量）"
            echo "  -m=MSG        指定 commit 消息（若有未提交更改）"
            echo "  --message=MSG 同 -m"
            echo "  --help        显示帮助"
            echo ""
            echo "示例:"
            echo "  ./deploy.sh                                  # 完整部署（需 SSH 密钥）"
            echo "  ./deploy.sh --password=xxx                   # 完整部署（使用密码）"
            echo "  DEPLOY_PASS=xxx ./deploy.sh                  # 通过环境变量传密码"
            echo "  ./deploy.sh -m='fix: 修复上传bug'             # 带 commit 消息的完整部署"
            echo "  ./deploy.sh --skip-push                      # 跳过推送，远程拉取并部署"
            echo "  ./deploy.sh --push-only                      # 仅推送到 GitHub"
            echo "  ./deploy.sh --pull-only                      # 仅在远程拉取代码"
            echo "  ./deploy.sh --build-only --no-cache          # 仅重建（无缓存）"
            exit 0
            ;;
        *) warn "未知参数: $arg" ;;
    esac
done

# 初始化 SSH 连接方式
setup_ssh

# ============ Step 1: 本地 Git Push ============
git_push() {
    info "正在推送本地代码到 GitHub ..."
    cd "$LOCAL_DIR"

    # 检查是否有未提交的更改
    if ! git diff --quiet HEAD 2>/dev/null || ! git diff --cached --quiet HEAD 2>/dev/null || [ -n "$(git ls-files --others --exclude-standard)" ]; then
        warn "检测到未提交的更改"

        # 显示变更摘要
        echo ""
        echo "  已修改: $(git diff --name-only HEAD 2>/dev/null | wc -l | tr -d ' ') 个文件"
        echo "  已暂存: $(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ') 个文件"
        echo "  未跟踪: $(git ls-files --others --exclude-standard 2>/dev/null | wc -l | tr -d ' ') 个文件"
        echo ""

        # 使用提供的 commit 消息，或生成默认消息
        if [ -z "$COMMIT_MSG" ]; then
            COMMIT_MSG="deploy: $(date '+%Y-%m-%d %H:%M:%S') 自动部署更新"
        fi

        info "提交消息: ${COMMIT_MSG}"
        git add -A
        git commit -m "$COMMIT_MSG"
    else
        info "工作区干净，无需提交"
    fi

    # 推送到远程
    git push origin "${GIT_BRANCH}"
    ok "代码已推送到 GitHub (${GIT_BRANCH})"
}

# ============ Step 2: 远程 Git Pull ============
git_pull() {
    info "正在远程服务器上拉取最新代码 ..."

    remote_exec <<PULL_SCRIPT
        set -e

        if [ ! -d "${REMOTE_DIR}/.git" ]; then
            if [ -d "${REMOTE_DIR}" ]; then
                echo ">>> 检测到已有目录但非 Git 仓库，正在初始化 ..."

                # 备份服务器专有文件（ssl 证书、.env 等）
                [ -d "${REMOTE_DIR}/ssl" ] && cp -r ${REMOTE_DIR}/ssl /tmp/_docx_ssl_bak
                [ -f "${REMOTE_DIR}/backend/.env" ] && cp ${REMOTE_DIR}/backend/.env /tmp/_docx_env_bak

                cd ${REMOTE_DIR}
                git init
                git remote add origin ${GIT_REPO}
                git fetch origin
                git reset --hard origin/${GIT_BRANCH}

                # 恢复服务器专有文件
                [ -d /tmp/_docx_ssl_bak ] && cp -r /tmp/_docx_ssl_bak ${REMOTE_DIR}/ssl && rm -rf /tmp/_docx_ssl_bak
                [ -f /tmp/_docx_env_bak ] && cp /tmp/_docx_env_bak ${REMOTE_DIR}/backend/.env && rm -f /tmp/_docx_env_bak
                echo ">>> Git 仓库初始化完成 ✅"
            else
                echo ">>> 远程目录不存在，正在 clone ..."
                git clone ${GIT_REPO} ${REMOTE_DIR}
                cd ${REMOTE_DIR}
            fi
        else
            cd ${REMOTE_DIR}
            echo ">>> 当前分支: \$(git branch --show-current)"
            echo ">>> 拉取最新代码 ..."
            git fetch origin
            git reset --hard origin/${GIT_BRANCH}
        fi

        echo ""
        echo ">>> 最新 commit:"
        git log -1 --format="  %h %s (%ci)"
        echo ""
PULL_SCRIPT

    ok "远程代码已更新"
}

# ============ Step 3: 构建并重启 ============
build_and_deploy() {
    info "正在远程构建 Docker 镜像 ..."

    remote_exec <<REMOTE_SCRIPT
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
        if docker compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/docs')" > /dev/null 2>&1; then
            echo "✅ Backend API 正常"
        else
            echo "❌ Backend API 异常"
        fi

        if docker compose exec -T frontend sh -c "wget -q -O /dev/null http://localhost/" > /dev/null 2>&1; then
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

if [ "$PUSH_ONLY" = true ]; then
    git_push
elif [ "$PULL_ONLY" = true ]; then
    git_pull
elif [ "$BUILD_ONLY" = true ]; then
    build_and_deploy
elif [ "$SKIP_PUSH" = true ]; then
    git_pull
    echo ""
    build_and_deploy
else
    # 完整流程: push → pull → build & deploy
    git_push
    echo ""
    git_pull
    echo ""
    build_and_deploy
fi

echo ""
info "线上地址: https://www.do-not-go-to.icu/"
echo ""
