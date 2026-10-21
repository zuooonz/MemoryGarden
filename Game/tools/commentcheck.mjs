// 注释吞代码检查（10-07）：行尾注释里出现像代码的语句（赋值、调用后的分号）——多半是改代码时把注释插进了一行中间，后半行代码被注释掉、不执行，也不报错。
// 这类错误出过三次（拼了“|| // 注释”导致语法错；速度更新被注释吞掉，爷爷在门口站住；出门折返检查的 lastMode 赋值一直没执行）。
// 注释里要举代码例子时以“用法”开头。用法：node tools/commentcheck.mjs
import fs from 'node:fs';
import path from 'node:path';
const src = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src');
const tail = /(?:^|[^:'"`\\])\/\/(.*)$/;   // 行里的 // 注释（不算网址、字符串里的）
const codey = /(\b[a-zA-Z_$][\w$.]*\s*(?:=|\+=|-=)\s*[^=;，。]+;)|(\)\s*;\s*$)|(\b(?:if|for|const|let|return)\s*[\s(][^，。]*[;{])/;
const bad = [];
for (const f of fs.readdirSync(src).filter(f => f.endsWith('.js'))) {
  fs.readFileSync(path.join(src, f), 'utf8').split('\n').forEach((l, i) => {
    const m = l.match(tail); if (!m) return; const c = m[1];
    if (/^\s*用法/.test(c)) return;
    if (codey.test(c) && /[a-zA-Z_$]\w*\(|=/.test(c)) bad.push(`${f}:${i + 1}  …//${c.slice(0, 100)}`);
  });
}
if (bad.length) { console.log('注释里像有被吞掉的代码（把代码移到注释前面，或注释另起一行）：\n' + bad.join('\n')); process.exit(1); }
console.log('注释吞代码：没有发现');
