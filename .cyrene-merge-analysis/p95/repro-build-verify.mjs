// 复现 work-verification-closure.test.ts:151 的失败：在仓库根下建临时工作区，真的跑 npm run build
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(process.cwd(), '.tmp-repro-verify');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir);
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
  scripts: { build: 'node -e "process.stdout.write(\'workspace-build-ok\')"' },
}));
fs.writeFileSync(path.join(dir, 'package-lock.json'), '{}\n');

console.log('temp cwd =', dir);
console.log('process.execPath =', process.execPath);
console.log('PATH 中的 npm 解析：');
for (const cand of ['npm', 'npm.cmd', 'npm.ps1']) {
  const r = spawnSync('where', [cand], { encoding: 'utf8', shell: true });
  console.log(`  where ${cand}: status=${r.status} ${JSON.stringify((r.stdout || '').trim())}`);
}

for (const shell of [true, false]) {
  const r = spawnSync('npm', ['run', 'build'], { cwd: dir, shell, encoding: 'utf8', timeout: 60000 });
  console.log(`\n--- spawn('npm',['run','build'], shell=${shell}) ---`);
  console.log('  status =', r.status, ' signal =', r.signal, ' error =', r.error?.message);
  console.log('  stdout =', JSON.stringify((r.stdout || '').slice(0, 200)));
  console.log('  stderr =', JSON.stringify((r.stderr || '').slice(0, 1600)));
  console.log('  stderr 长度 =', (r.stderr || '').length);
}

fs.rmSync(dir, { recursive: true, force: true });
console.log('\n清理完成');
