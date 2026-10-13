#!/usr/bin/env bash
# 把当前代码重新发布到 GitHub Pages（给 HR / 面试官看的公开入口）
#
#   站点地址：https://wowj-bot.github.io/Pronunciation-APP/
#
# 用法：  bash scripts/deploy-pages.sh
#
# 说明：GitHub Pages 要求以子路径 /Pronunciation-APP/ 提供服务，
#       所以构建时用 npm run build:gh（等价于 vite build --base=/Pronunciation-APP/），
#       并把 index.html 复制一份成 404.html，作为 SPA 的路由回退。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

REMOTE_URL="https://github.com/WowJ-bot/Pronunciation-APP.git"
PROXY="http://127.0.0.1:7890"
SCRATCH=".workbuddy/gh-pages-deploy"

echo "[1/4] 构建（子路径模式）"
npm run build:gh

echo "[2/4] 生成 SPA 路由回退页"
cp dist/index.html dist/404.html

echo "[3/4] 组装发布目录"
rm -rf "$SCRATCH"
mkdir -p "$SCRATCH"
cp -r dist/. "$SCRATCH"/
cd "$SCRATCH"
git init -b gh-pages -q

# 直接写 config：本机这套 PortableGit 的 credential.helper 多值链会让
# 系统的 helper-selector 先跑并静默挂住，必须用「空值 + manager」把链重置掉。
GIT_USER_NAME="$(git -C "$REPO_ROOT" config user.name || echo 'WowJ-bot')"
GIT_USER_EMAIL="$(git -C "$REPO_ROOT" config user.email || echo 'wowj-bot@users.noreply.github.com')"
cat > .git/config <<EOF
[core]
	repositoryformatversion = 0
	filemode = false
	bare = false
	logallrefupdates = true
[user]
	name = $GIT_USER_NAME
	email = $GIT_USER_EMAIL
[credential]
	helper =
	helper = manager
[http]
	proxy = $PROXY
[https]
	proxy = $PROXY
[remote "origin"]
	url = $REMOTE_URL
	fetch = +refs/heads/*:refs/remotes/origin/*
EOF

git add -A
git commit -q -m "deploy: GitHub Pages 更新 $(date '+%Y-%m-%d %H:%M')"

echo "[4/4] 推送 gh-pages"
env -u HTTP_PROXY -u HTTPS_PROXY -u http_proxy -u https_proxy \
  GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never \
  git push -f origin gh-pages

echo
echo "完成。约 1 分钟后生效： https://wowj-bot.github.io/Pronunciation-APP/"
