// Simulates typing: every prefix of every example must convert without crashing.
const path = require('path');
for (const f of ['expr', 'pseudo', 'python', 'convert', 'examples']) require(path.join(__dirname, '../js', f + '.js'));
require('./py_tests.js');
const PC = globalThis.PC;
let crashes = 0, runs = 0;
const texts = [];
for (const ex of PC.EXAMPLES) { texts.push(['ps', ex.pseudo]); texts.push(['py', PC.pseudoToPython(ex.pseudo).code]); }
for (const ex of PC.PY_TESTS) texts.push(['py', ex.py]);
for (const [lang, text] of texts) {
  for (let i = 0; i <= text.length; i++) {
    const s = text.slice(0, i);
    runs++;
    try { lang === 'ps' ? PC.pseudoToPython(s) : PC.pythonToPseudo(s); }
    catch (e) { crashes++; if (crashes < 8) console.log(lang, JSON.stringify(s.slice(-60)), '\n  ', e.stack.split('\n').slice(0, 3).join('\n   ')); }
  }
}
console.log(`${runs} prefixes, ${crashes} crashes`);
process.exit(crashes ? 1 : 0);
