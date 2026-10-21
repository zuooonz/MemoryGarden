// 启动检查（部署前必跑，约 5 秒）：用无头浏览器打开 dist/index.html，标题画面要出现、页面不能报错。
// 09-28：一次改动让游戏在浏览器里一打开就报错，而快速检查（不开浏览器）全部通过——所以部署前一定要真的打开一次。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const steps = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mg-boot-')), 'boot.json');
fs.writeFileSync(steps, JSON.stringify([{ wait: 4000, js: "return !!document.querySelector('#bGo')" }]));
const r = spawnSync('node', [path.join(here, 'shot.mjs'), '800', '600', steps], { encoding: 'utf8', timeout: 90000 });
const out = (r.stdout || '') + (r.stderr || '');
fs.rmSync(path.dirname(steps), { recursive: true, force: true });
if (/EXC|ERR/.test(out) || !out.includes('> true')) { console.log('✗ 游戏在浏览器里打不开或报错：\n' + out.split('\n').filter(l => /EXC|ERR|>/.test(l)).join('\n').slice(0, 600)); process.exit(1); }
console.log('✓ 浏览器里能正常打开（标题画面出现、没有报错）');
