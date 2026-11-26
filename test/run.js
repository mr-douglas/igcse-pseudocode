// node test/run.js  — converts every example both ways, checks round trips and runs the Python.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
for (const f of ['expr', 'pseudo', 'python', 'convert', 'examples']) require(path.join(__dirname, '../js', f + '.js'));
const PC = globalThis.PC;
require('./py_tests.js');
let failures = 0;
const norm = (s) => s.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();

for (const ex of PC.EXAMPLES) {
  const py = PC.pseudoToPython(ex.pseudo);
  const back = PC.pythonToPseudo(py.code);
  const again = PC.pseudoToPython(back.code);
  const problems = [];
  if (py.errors.length) problems.push('pseudo->py errors: ' + JSON.stringify(py.errors));
  if (back.errors.length) problems.push('py->pseudo errors: ' + JSON.stringify(back.errors));
  if (norm(again.code) !== norm(py.code)) problems.push('Python not stable after a round trip');
  if (ex.exact !== false && norm(back.code) !== norm(ex.pseudo)) problems.push('pseudocode round trip differs');
  const tmp = path.join(__dirname, 'tmp.py');
  fs.writeFileSync(tmp, py.code);
  try { execFileSync('python3', ['-m', 'py_compile', tmp], { stdio: 'pipe' }); } catch (e) { problems.push('Python does not compile: ' + e.stderr); }
  if (ex.stdin !== undefined) {
    try {
      const outp = execFileSync('python3', [tmp], { input: ex.stdin, stdio: 'pipe', cwd: __dirname, timeout: 5000 }).toString();
      if (ex.stdout !== undefined && outp !== ex.stdout) problems.push(`output ${JSON.stringify(outp)} != ${JSON.stringify(ex.stdout)}`);
    } catch (e) { problems.push('Python run failed: ' + (e.stderr || e.message)); }
  }
  if (problems.length || process.argv.includes('-v')) {
    console.log(`\n=== ${ex.name} ===`);
    console.log('--- Python:\n' + py.code);
    console.log('--- back to pseudocode:\n' + back.code);
    if (py.warnings.length || back.warnings.length) console.log('warnings', py.warnings, back.warnings);
  }
  if (problems.length) { failures++; console.log('PROBLEMS:\n  ' + problems.join('\n  ')); } else console.log('ok  ' + ex.name);
}

// Python-first cases
for (const ex of PC.PY_TESTS || []) {
  const r = PC.pythonToPseudo(ex.py);
  const ok = norm(r.code) === norm(ex.pseudo) && !r.errors.length;
  if (!ok) { failures++; console.log(`\n=== PY ${ex.name} ===\n${r.code}\nexpected:\n${ex.pseudo}\n`, r.errors, r.warnings); } else console.log('ok  py: ' + ex.name);
}
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
