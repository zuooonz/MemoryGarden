// 测试用 Chrome 的联网策略（唯一来源，shot.mjs、video/record.mjs 等都从这里取；browsercheck.mjs 检查）。
// 用户 10-07 定：无头 Chrome 不使用代理网络，直连。
//   --no-proxy-server：不读环境里的 HTTPS_PROXY（那是 Clash，会让测试浏览器的所有外网流量走 VPN），一律直连。
// 背景：测试每次用全新的临时配置目录，Chrome 运行约 1.5 分钟后会开始下载模型库、组件包、安全浏览数据（75—158MB；
// 实测短启动 3—12 秒只多约 1MB），曾经全部经 Clash，3 天累计 57GB。
// 已知：直连不拦这些下载，长时间运行的测试浏览器仍会从宽带下（国内直连 Google 部分域名会超时，发生在后台线程，实测不拖慢测试：同一步骤 3.07 秒）。
// 若宽带流量也要省：再加 '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'（除本机外域名一律解析失败，实测零外连）。
export const NO_PROXY_ARGS = ['--no-proxy-server'];
