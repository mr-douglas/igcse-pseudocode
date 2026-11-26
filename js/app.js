// Page behaviour: whichever box the user edits is converted into the other one.
(function () {
  'use strict';
  const PC = window.PC;
  const ps = document.getElementById('pseudo');
  const py = document.getElementById('python');
  const msgs = { pseudo: document.getElementById('pseudo-msgs'), python: document.getElementById('python-msgs') };
  const KEY = 'igcse-pseudocode';
  let timer = null;

  function show(list, result, otherName) {
    list.innerHTML = '';
    const add = (cls, text) => { const li = document.createElement('li'); li.className = cls; li.textContent = text; list.append(li); };
    result.errors.forEach((e) => add('error', (e.line ? `Line ${e.line}: ` : '') + e.msg));
    result.warnings.forEach((w) => add('warning', (w.line ? `Line ${w.line}: ` : '') + w.msg));
    if (!result.errors.length && !result.warnings.length) add('ok', `Converted to ${otherName}.`);
  }
  // Messages describe the box the user typed in, so they appear under it.
  function convert(from) {
    try {
      if (from === 'pseudo') {
        const r = PC.pseudoToPython(ps.value);
        py.value = r.code;
        show(msgs.pseudo, r, 'Python');
        msgs.python.innerHTML = '';
      } else {
        const r = PC.pythonToPseudo(py.value);
        ps.value = r.code;
        show(msgs.python, r, 'pseudocode');
        msgs.pseudo.innerHTML = '';
      }
      localStorage.setItem(KEY, JSON.stringify({ from, text: from === 'pseudo' ? ps.value : py.value }));
    } catch (e) {
      msgs[from].innerHTML = `<li class="error">Could not convert: ${String(e.message).replace(/</g, '&lt;')}</li>`;
    }
  }

  function schedule(from) { clearTimeout(timer); timer = setTimeout(() => convert(from), 120); }

  ps.addEventListener('input', () => {
    // Turn <- into ← as you type, keeping the cursor in place.
    if (ps.value.includes('<-')) {
      const at = ps.selectionStart, before = ps.value.slice(0, at);
      const removed = (before.match(/<-/g) || []).length;
      ps.value = ps.value.replace(/<-/g, '←');
      ps.selectionStart = ps.selectionEnd = at - removed;
    }
    schedule('pseudo');
  });
  py.addEventListener('input', () => schedule('python'));

  // Tab / Shift+Tab indent with four spaces.
  for (const ta of [ps, py]) {
    ta.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
      e.preventDefault();
      const s = ta.selectionStart, en = ta.selectionEnd, v = ta.value;
      const lineStart = v.lastIndexOf('\n', s - 1) + 1;
      if (!e.shiftKey && s === en) {
        ta.setRangeText('    ', s, en, 'end');
      } else {
        const block = v.slice(lineStart, en);
        const out = e.shiftKey ? block.replace(/^ {1,4}/gm, '') : block.replace(/^/gm, '    ');
        ta.setRangeText(out, lineStart, en, 'select');
      }
      ta.dispatchEvent(new Event('input'));
    });
  }

  document.querySelectorAll('[data-insert]').forEach((b) => b.addEventListener('click', () => {
    ps.focus(); ps.setRangeText(b.dataset.insert, ps.selectionStart, ps.selectionEnd, 'end'); schedule('pseudo');
  }));
  document.querySelectorAll('.copy').forEach((b) => b.addEventListener('click', async () => {
    const ta = document.getElementById(b.dataset.target);
    try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand('copy'); }
    const t = b.textContent; b.textContent = 'Copied'; setTimeout(() => { b.textContent = t; }, 1200);
  }));

  const sel = document.getElementById('examples');
  PC.EXAMPLES.forEach((ex, i) => { const o = document.createElement('option'); o.value = i; o.textContent = ex.name; sel.append(o); });
  sel.addEventListener('change', () => {
    if (sel.value === '') return;
    ps.value = PC.EXAMPLES[+sel.value].pseudo;
    convert('pseudo');
    sel.value = '';
  });
  document.getElementById('clear').addEventListener('click', () => {
    ps.value = ''; py.value = ''; msgs.pseudo.innerHTML = ''; msgs.python.innerHTML = '';
    localStorage.removeItem(KEY); ps.focus();
  });

  // Restore the last session, or start with the first example.
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* ignore */ }
  if (saved && typeof saved.text === 'string') {
    (saved.from === 'python' ? py : ps).value = saved.text;
    convert(saved.from === 'python' ? 'python' : 'pseudo');
  } else {
    ps.value = PC.EXAMPLES[0].pseudo;
    convert('pseudo');
  }
})();
