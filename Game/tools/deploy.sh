#!/usr/bin/env bash
# 部署到服务器上的 nginx-app（Nginx Proxy Manager）静态目录。
#   npm run deploy              构建并直接更新首页 index.html，上一版留作 index.prev.html（用户 09-26 定：他自己用首页测试）
#   npm run stage               只发到预发布页 /next（next.html）；10-13 用户定：开发分支始终用这一个入口，首页不动
#   npm run release             把预发布页转为首页
#   npm run rollback            正式首页退回上一版（index.prev.html）
# 初赛定版 chusai-2026-09-25.html 两步都不碰。
# 用法：DEPLOY_HOST=<用户>@<服务器地址> DEPLOY_DIR=<服务器上的网页目录> npm run deploy
# 服务器地址和目录只放在本机环境变量里，不写进仓库（10-21 仓库公开前改）。公开试玩用 GitHub Pages。
set -euo pipefail
: "${DEPLOY_HOST:?请设置 DEPLOY_HOST，例如 DEPLOY_HOST=user@1.2.3.4}"
: "${DEPLOY_DIR:?请设置 DEPLOY_DIR：服务器上放网页的目录}"
DEST="$DEPLOY_DIR"
cd "$(dirname "$0")/.."
ssh_() { ssh -o BatchMode=yes "$DEPLOY_HOST" "$@"; }
# 网页图标与 manifest（public/：favicon.ico、icons/、manifest.webmanifest）传到服务器根目录，首页和 /next 共用；10-14 起
icons_() { scp -q -r -o BatchMode=yes public/. "$DEPLOY_HOST:$DEST/"; }
case "${1:-prod}" in
  prod)
    node build.mjs
    node tools/bootcheck.mjs   # 部署前真的在浏览器里打开一次（打不开就不上传；09-28 起）
    ssh_ "mkdir -p $DEST && { cp -f $DEST/index.html $DEST/index.prev.html 2>/dev/null || true; }"
    scp -q -o BatchMode=yes dist/index.html "$DEPLOY_HOST:$DEST/index.html"
    icons_
    echo "已部署首页（md5 $(md5sum dist/index.html | cut -c1-8)）。上一版保存在 index.prev.html；退回：npm run rollback"
    ;;
  stage)
    node build.mjs
    node tools/bootcheck.mjs
    ssh_ "mkdir -p $DEST"
    scp -q -o BatchMode=yes dist/index.html "$DEPLOY_HOST:$DEST/next.html"
    icons_
    ssh_ "mkdir -p $DEST/next && cp -f $DEST/next.html $DEST/next/index.html"   # /next（不带 .html）也能打开：nginx 先找 /next/ 目录里的 index.html（10-13 用户：只留一个开发入口 /next；原来 /next 落到首页）
    echo "已发到预发布页 /next、next.html（md5 $(md5sum dist/index.html | cut -c1-8)）。"
    ;;
  release)
    ssh_ "test -f $DEST/next.html && { cp -f $DEST/index.html $DEST/index.prev.html 2>/dev/null || true; cp -f $DEST/next.html $DEST/index.html; md5sum $DEST/index.html | cut -c1-8; }" | sed 's/^/正式首页已更新为预发布版，md5 /'
    echo "上一版保存在 index.prev.html；退回：npm run rollback"
    ;;
  rollback)
    ssh_ "test -f $DEST/index.prev.html && cp -f $DEST/index.prev.html $DEST/index.html && md5sum $DEST/index.html | cut -c1-8" | sed 's/^/正式首页已退回上一版，md5 /'
    ;;
  *) echo "用法：deploy.sh [prod|stage|release|rollback]"; exit 1 ;;
esac
