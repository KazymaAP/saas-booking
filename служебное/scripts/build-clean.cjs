// служебное/scripts/build-clean.cjs — сборка с читаемым логом.
// PowerShell портит юникод в логе (дерево маршрутов приходит в cp866), поэтому собираем
// через Node и пишем чистый UTF-8: видно, какие маршруты статические (○), а какие динамические (ƒ).
const { spawn } = require('node:child_process');
const fs = require('node:fs');

const env = { ...process.env, NEXT_DIST_DIR: '.next-prod' };
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'build'], { env, shell: true });
const chunks = [];
child.stdout.on('data', (d) => chunks.push(d));
child.stderr.on('data', (d) => chunks.push(d));
child.on('close', (code) => {
  const text = Buffer.concat(chunks).toString('utf8');
  fs.mkdirSync('служебное/out', { recursive: true });
  fs.writeFileSync('служебное/out/build-clean.log', text, 'utf8');

  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^[\u251c\u2514\u250c]\s*([\u25cb\u25cf\u0192])\s*(\S+)/);
    if (m) rows.push({ kind: m[1] === '\u0192' ? 'DYNAMIC' : 'STATIC', route: m[2] });
  }
  const statics = rows.filter((r) => r.kind === 'STATIC').map((r) => r.route);
  const dyn = rows.filter((r) => r.kind === 'DYNAMIC').map((r) => r.route);
  console.log('exit', code);
  console.log('STATIC (' + statics.length + '):', statics.join(' '));
  console.log('DYNAMIC (' + dyn.length + '):', dyn.slice(0, 25).join(' '));
  const warnings = text.split(/\r?\n/).filter((l) => /warn|Dynamic server usage|couldn't be rendered|force-static|Error/i.test(l));
  if (warnings.length > 0) console.log('--- предупреждения ---\n' + warnings.slice(0, 20).join('\n'));
});
