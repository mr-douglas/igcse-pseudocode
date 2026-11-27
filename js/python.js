// Reads Python (the subset that matches the 0478 pseudocode) and writes Python from pseudocode.
(function (G) {
  'use strict';
  const PC = G.PC;
  const { fail, unsupported, Parser, fromPy, print, toPascal, num, intVal, addK, stripParen, splitTop } = PC;

  const PY_TYPE = { int: 'INTEGER', float: 'REAL', str: 'STRING', bool: 'BOOLEAN' };
  const TO_PY_TYPE = { INTEGER: 'int', REAL: 'float', STRING: 'str', CHAR: 'str', BOOLEAN: 'bool' };
  const DEFAULT = { INTEGER: '0', REAL: '0.0', STRING: '""', CHAR: '""', BOOLEAN: 'False' };

  // ---------- reading Python ----------
  function logicalLines(src) {
    const phys = src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    const out = [];
    let buf = null, depth = 0;
    phys.forEach((line, i) => {
      let q = null, code = line, comment = null;
      for (let j = 0; j < line.length; j++) {
        const c = line[j];
        if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
        if (c === '"' || c === "'") q = c;
        else if ('([{'.includes(c)) depth++;
        else if (')]}'.includes(c)) depth = Math.max(0, depth - 1);
        else if (c === '#') { code = line.slice(0, j); comment = line.slice(j + 1).replace(/^ /, ''); break; }
      }
      let cont = depth > 0;
      if (/\\\s*$/.test(code)) { cont = true; code = code.replace(/\\\s*$/, ''); }
      if (buf) { buf.text += ' ' + code.trim(); if (comment !== null) buf.comment = comment; }
      else buf = { no: i + 1, indent: /^ */.exec(line)[0].length, text: code.trim(), comment };
      if (!cont) { out.push(buf); buf = null; }
    });
    if (buf) out.push(buf);
    return out;
  }

  // Finds a top-level "=" used for assignment (not ==, <=, >=, !=). Returns [index, augmented op].
  function findAssign(text) {
    let depth = 0, q = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") q = c;
      else if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (c === '=' && depth === 0) {
        if (text[i + 1] === '=') { i++; continue; }
        const prev = text[i - 1];
        if ('<>!='.includes(prev)) continue;
        const aug = /(\*\*|\/\/|[+\-*/%])$/.exec(text.slice(0, i));
        return [i, aug ? aug[1] : null];
      }
    }
    return null;
  }
  // Index of the top-level ":" that ends a block header, or -1.
  function headerColon(text) {
    let depth = 0, q = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'") q = c;
      else if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (c === ':' && depth === 0) return i;
    }
    return -1;
  }

  const raw = (t) => { const p = new Parser(t, 'py'); const e = p.expr(); p.end(); return e; };
  const isCall = (n, name) => n && n.t === 'call' && n.f.t === 'name' && n.f.v === name;
  const isMethod = (n, name) => n && n.t === 'call' && n.f.t === 'attr' && n.f.name === name;

  function parsePython(src) {
    const lines = logicalLines(src);
    const errors = [], warnings = [];
    const handles = new Map(); // Python file variable -> pseudocode file identifier
    let pos = 0;

    function nextCode(from) { let j = from; while (j < lines.length && lines[j].text === '') j++; return j; }

    function block(indent) {
      const out = [];
      while (pos < lines.length) {
        const L = lines[pos];
        if (L.text === '') {
          const j = nextCode(pos);
          const inside = j < lines.length && lines[j].indent >= indent;
          const ownComment = L.comment !== null && indent > 0 && L.indent >= indent;
          if (!inside && !ownComment) break;
          out.push(L.comment !== null ? { k: 'comment', text: L.comment } : { k: 'blank' });
          pos++; continue;
        }
        if (L.indent < indent) break;
        if (L.indent > indent) { errors.push({ line: L.no, msg: 'Unexpected indent' }); }
        out.push(...statement());
      }
      return out;
    }

    function body(L, after) {
      if (after.trim()) return simple(after.trim(), L);
      const j = nextCode(pos);
      if (j >= lines.length || lines[j].indent <= L.indent) fail('This block has no indented statements');
      return block(lines[j].indent);
    }

    function statement() {
      const L = lines[pos];
      pos++;
      try {
        const out = compound(L);
        if (out.length && L.comment !== null && !out[0].comment && out[0].k !== 'comment') out[0].comment = L.comment;
        return out;
      } catch (e) {
        if (!(e instanceof PC.ConvError)) throw e;
        (e.unsupported ? warnings : errors).push({ line: L.no, msg: e.message });
        // Skip the rest of an unparseable block.
        while (pos < lines.length && (lines[pos].text === '' || lines[pos].indent > L.indent)) {
          if (lines[pos].text !== '' || nextCode(pos) < lines.length && lines[nextCode(pos)].indent > L.indent) pos++; else break;
        }
        return [{ k: 'bad', text: L.text, msg: e.message }];
      }
    }

    function compound(L) {
      const t = L.text;
      let m = /^(if|elif|while|for|def|match|with|else|try|class|except|finally)\b/.exec(t);
      if (!m) return simple(t, L);
      const kw = m[1];
      const c = headerColon(t);
      if (c < 0) fail(`"${kw}" line must end with a colon`);
      const head = t.slice(kw.length, c).trim(), after = t.slice(c + 1);
      switch (kw) {
        case 'if': return [ifChain(L, head, after)];
        case 'elif': case 'else': fail(`"${kw}" without a matching if`);
        // eslint-disable-next-line no-fallthrough
        case 'while': {
          const cond = fromPy(raw(head)), b = body(L, after);
          const last = b[b.length - 1];
          if (cond.t === 'bool' && cond.v && last && last.k === 'if' && !last.els && last.then.length === 1 && last.then[0].k === 'break') {
            noBreak(b.slice(0, -1));
            return [{ k: 'repeat', body: b.slice(0, -1), cond: last.cond }];
          }
          noBreak(b);
          return [{ k: 'while', cond, body: b }];
        }
        case 'for': {
          m = /^([A-Za-z_]\w*)\s+in\s+range\s*\((.*)\)$/.exec(head);
          if (!m) unsupported('Only "for i in range(...)" loops match the pseudocode FOR loop');
          const args = splitTop(m[2], ',').filter(Boolean).map((a) => fromPy(raw(a)));
          let from = num(0), to, step = null;
          if (args.length === 1) to = args[0];
          else if (args.length === 2 || args.length === 3) [from, to, step = null] = args;
          else fail('range() needs 1, 2 or 3 values');
          const s = step ? intVal(stripParen(step)) : 1;
          if (step && s === null) warnings.push({ line: L.no, msg: 'The STEP is not a number, so the loop end assumes it is positive' });
          const end = addK(stripParen(to), s !== null && s < 0 ? 1 : -1);
          if (step && s === 1) step = null;
          return [{ k: 'for', v: toPascal(m[1]), from, to: end, step, body: body(L, after) }];
        }
        case 'def': {
          m = /^([A-Za-z_]\w*)\s*\((.*)\)\s*(?:->\s*(\w+))?$/.exec(head);
          if (!m) fail('Could not read this function definition');
          const params = splitTop(m[2], ',').filter(Boolean).map((p) => {
            const pm = /^([A-Za-z_]\w*)\s*(?::\s*(\w+))?\s*(=.*)?$/.exec(p);
            if (!pm) unsupported(`Parameter "${p}" is not supported`);
            if (pm[3]) unsupported('Default parameter values are not part of the pseudocode');
            return { name: toPascal(pm[1]), type: pm[2] ? PY_TYPE[pm[2]] || null : null };
          });
          const b = body(L, after);
          const globals = [];
          const keep = b.filter((s) => { if (s.k === 'global') { globals.push(...s.names); return false; } return true; });
          const returns = hasReturnValue(keep);
          return [{ k: returns ? 'func' : 'proc', name: toPascal(m[1]), params, rtype: m[3] ? PY_TYPE[m[3]] || null : null,
            body: keep, globals, line: L.no }];
        }
        case 'match': {
          const s = { k: 'case', subject: fromPy(raw(head)), cases: [], other: null };
          const j = nextCode(pos);
          if (j >= lines.length || lines[j].indent <= L.indent) fail('match has no cases');
          const ind = lines[j].indent;
          while (pos < lines.length) {
            const C = lines[pos];
            if (C.text === '') { pos++; continue; }
            if (C.indent < ind) break;
            const cm = /^case\s+(.+)$/.exec(C.text.slice(0, Math.max(0, headerColon(C.text))));
            if (!cm || C.indent !== ind) fail('Expected "case <value>:"');
            pos++;
            const cb = body(C, C.text.slice(headerColon(C.text) + 1));
            const pat = cm[1].trim();
            if (pat === '_') s.other = cb;
            else {
              if (splitTop(pat, '|').length > 1) unsupported('Only one value per case is part of the pseudocode');
              const v = fromPy(raw(pat));
              if (!['num', 'str', 'bool', 'un'].includes(v.t)) unsupported('Case values must be single literal values');
              s.cases.push({ value: v, body: cb });
            }
          }
          return [s];
        }
        case 'with': {
          m = /^(open\s*\(.*\))\s+as\s+([A-Za-z_]\w*)$/.exec(head);
          if (!m) unsupported('Only "with open(...) as f:" is supported');
          const open = openStmt(m[2], raw(m[1]));
          const b = body(L, after);
          return [open, ...b, { k: 'close', file: open.file }];
        }
        default: unsupported(`"${kw}" is not part of the pseudocode`);
      }
    }

    function ifChain(L, head, after) {
      const s = { k: 'if', cond: fromPy(raw(head)), then: body(L, after), els: null };
      const j = nextCode(pos);
      if (j < lines.length && lines[j].indent === L.indent) {
        const N = lines[j];
        const em = /^(elif|else)\b/.exec(N.text);
        if (em) {
          pos = j + 1;
          const c = headerColon(N.text);
          if (c < 0) fail(`"${em[1]}" line must end with a colon`);
          if (em[1] === 'elif') s.els = [ifChain(N, N.text.slice(4, c).trim(), N.text.slice(c + 1))];
          else s.els = body(N, N.text.slice(c + 1));
        }
      }
      return s;
    }

    function noBreak(list) {
      for (const s of list) {
        if (s.k === 'break') fail('break is only supported as "if <condition>: break" at the end of "while True:" (a REPEAT ... UNTIL loop)');
        if (s.k === 'if') { noBreak(s.then); if (s.els) noBreak(s.els); }
        if (s.k === 'case') { s.cases.forEach((c) => noBreak(c.body)); if (s.other) noBreak(s.other); }
      }
    }
    function hasReturnValue(list) {
      return list.some((s) => (s.k === 'return' && s.value) ||
        ['then', 'els', 'body', 'other'].some((k) => Array.isArray(s[k]) && s.k !== 'proc' && s.k !== 'func' && hasReturnValue(s[k])) ||
        (s.cases && s.cases.some((c) => hasReturnValue(c.body))));
    }

    function openStmt(handle, call) {
      if (!isCall(call, 'open') || call.args.length < 1) fail('Expected open(<file name>, <mode>)');
      const mode = call.args[1] ? call.args[1] : { t: 'str', v: 'r' };
      const md = mode.t === 'str' ? { r: 'READ', w: 'WRITE' }[mode.v] : null;
      if (!md) unsupported('Only the "r" (READ) and "w" (WRITE) file modes are part of the pseudocode');
      const file = fromPy(call.args[0]);
      handles.set(handle, file);
      return { k: 'open', file, mode: md };
    }
    function handleOf(n) {
      if (n.t === 'name' && handles.has(n.v)) return handles.get(n.v);
      fail('Open the file with open() before using it');
    }
    const STRIP = (n) => (isMethod(n, 'rstrip') || isMethod(n, 'strip')) ? n.f.e : n;

    function simple(t, L) {
      if (t === 'pass') return [];
      if (t === 'break') return [{ k: 'break' }];
      if (/^global\s/.test(t)) return [{ k: 'global', names: t.slice(7).split(',').map((s) => toPascal(s.trim())) }];
      if (/^import\s+random$/.test(t)) return [];
      if (/^(import|from)\s/.test(t)) unsupported('Only "import random" is needed for the pseudocode');
      if (t === 'return') fail('RETURN needs a value (a procedure just ends)');
      if (/^return\s/.test(t)) return [{ k: 'return', value: fromPy(raw(t.slice(7))) }];
      if (/^(continue|try|raise|assert|del|yield|nonlocal|lambda)\b/.test(t)) unsupported(`"${t.split(/\W/)[0]}" is not part of the pseudocode`);
      if (headerColon(t) > 0 && /^(if|while|for|def|match|with|elif|else)\b/.test(t)) return compound({ ...L, text: t });

      const a = findAssign(t);
      if (a) {
        const [i, aug] = a;
        let lhs = t.slice(0, aug ? i - aug.length : i).trim();
        const rhs = t.slice(i + 1).trim();
        if (splitTop(lhs, ',').length > 1) unsupported('Assigning several variables at once is not part of the pseudocode');
        // Annotation: Name: type [= value]
        const ann = /^([A-Za-z_]\w*)\s*:\s*(\w+)$/.exec(lhs);
        if (ann) {
          const out = [{ k: 'declare', name: toPascal(ann[1]), type: PY_TYPE[ann[2]] || 'STRING', dims: null }];
          if (rhs) out.push(...assign(ann[1], rhs, null, L));
          return out;
        }
        return assign(lhs, rhs, aug, L);
      }
      const ann = /^([A-Za-z_]\w*)\s*:\s*(\w+)$/.exec(t);
      if (ann) return [{ k: 'declare', name: toPascal(ann[1]), type: PY_TYPE[ann[2]] || 'STRING', dims: null }];

      const e = raw(t);
      if (isCall(e, 'print')) return [output(e, L)];
      if (isMethod(e, 'write') && e.args.length === 1) {
        let v = e.args[0];
        if (v.t === 'bin' && v.op === '+' && v.r.t === 'str' && v.r.v === '\n') v = v.l;
        if (isCall(v, 'str') && v.args.length === 1) v = v.args[0];
        return [{ k: 'write', file: handleOf(e.f.e), value: fromPy(v) }];
      }
      if (isMethod(e, 'close') && !e.args.length) return [{ k: 'close', file: handleOf(e.f.e) }];
      if (e.t === 'call' && e.f.t === 'name' && !PC.PY_BUILTINS.has(e.f.v)) {
        const c = fromPy(e);
        return [{ k: 'call', name: c.f, args: c.args }];
      }
      unsupported('This statement is not part of the pseudocode');
    }

    function assign(lhsText, rhs, aug, L) {
      const tgt = fromPy(raw(lhsText));
      if (tgt.t !== 'name' && tgt.t !== 'index') fail('You can only assign to a variable or an array element');
      if (aug) {
        const op = { '+': '+', '-': '-', '*': '*', '/': '/', '//': 'DIV', '%': 'MOD', '**': '^' }[aug];
        const r = fromPy(raw(rhs));
        return [{ k: 'assign', target: tgt, value: { t: 'bin', op, l: tgt, r: r.t === 'bin' && PC.PREC[r.op] <= PC.PREC[op] ? { t: 'paren', e: r } : r } }];
      }
      // 2D array: [[v] * C for _ in range(R)]
      let m = /^\[\s*\[(.+)\]\s*\*\s*(.+?)\s+for\s+\w+\s+in\s+range\s*\((.+)\)\s*\]$/.exec(rhs);
      if (m && tgt.t === 'name') {
        const v = fromPy(raw(m[1]));
        return [{ k: 'declare', name: tgt.v, type: litType(v), dims: [bounds(fromPy(raw(m[3]))), bounds(fromPy(raw(m[2])))], arrayInit: v }];
      }
      const v = raw(rhs);
      if (tgt.t === 'name') {
        if (v.t === 'bin' && v.op === '*' && v.l.t === 'list' && v.l.items.length === 1) {
          const d = fromPy(v.l.items[0]);
          return [{ k: 'declare', name: tgt.v, type: litType(d), dims: [bounds(fromPy(v.r))], arrayInit: d }];
        }
        if (v.t === 'list') {
          const items = v.items.map(fromPy);
          if (!items.length) unsupported('Empty lists are not part of the pseudocode; give the array a size, e.g. [0] * 10');
          return [{ k: 'declare', name: tgt.v, type: litType(items[0]), dims: [[num(0), num(items.length - 1)]] },
            ...items.map((it, i) => ({ k: 'assign', target: { t: 'index', e: tgt, idx: [num(i)] }, value: it }))];
        }
        if (isCall(v, 'open')) {
          const s = openStmt(lhsText.trim(), v);
          return [s];
        }
      }
      // INPUT
      let cast = null, inner = v;
      if ((isCall(v, 'int') || isCall(v, 'float')) && v.args.length === 1) { cast = v.f.v; inner = v.args[0]; }
      if (isCall(inner, 'input')) {
        if (inner.args.length > 1) fail('input() takes at most one prompt');
        return [{ k: 'input', target: tgt, prompt: inner.args[0] ? fromPy(inner.args[0]) : null, cast }];
      }
      // READFILE
      let rl = STRIP(inner);
      if (isMethod(rl, 'readline') && !rl.args.length) return [{ k: 'read', file: handleOf(rl.f.e), target: tgt, cast }];
      return [{ k: 'assign', target: tgt, value: fromPy(v), pyName: lhsText.trim() }];
    }

    // Size N becomes bounds; [x] * (N + 1) means indexes 1..N, [x] * N means 0..N-1.
    function bounds(size) {
      size = stripParen(size);
      if (size.t === 'bin' && size.op === '+' && intVal(size.r) === 1) return [num(1), size.l];
      return [num(0), addK(size, -1)];
    }
    function litType(v) {
      if (v.t === 'num') return v.v.includes('.') ? 'REAL' : 'INTEGER';
      if (v.t === 'un' && v.e.t === 'num') return v.e.v.includes('.') ? 'REAL' : 'INTEGER';
      if (v.t === 'bool') return 'BOOLEAN';
      if (v.t === 'str') return v.q === "'" && v.v.length === 1 ? 'CHAR' : 'STRING';
      return 'INTEGER';
    }

    function output(e, L) {
      const values = [];
      for (const a of e.args) {
        if (a.t === 'kw') {
          if (a.name === 'sep' && a.e.t === 'str' && a.e.v === '') continue;
          if (a.name === 'sep' && a.e.t === 'str' && a.e.v === ' ') continue;
          warnings.push({ line: L.no, msg: `print(${a.name}=...) has no pseudocode equivalent and was left out` });
          continue;
        }
        values.push(...outputParts(a));
      }
      if (!values.length) values.push({ t: 'str', v: '', q: '"' });
      return { k: 'output', values };
    }
    function outputParts(a) {
      if (a.t === 'fstr') return fstring(a.v);
      if (isCall(a, 'str') && a.args.length === 1) return outputParts(a.args[0]);
      if (a.t === 'bin' && a.op === '+') {
        const parts = [];
        const flat = (n) => { if (n.t === 'bin' && n.op === '+') { flat(n.l); flat(n.r); } else parts.push(n); };
        flat(a);
        if (parts.some((p) => p.t === 'str' || p.t === 'fstr' || isCall(p, 'str'))) return parts.flatMap(outputParts);
      }
      return [fromPy(a)];
    }
    function fstring(s) {
      const out = [];
      let lit = '';
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '{' && s[i + 1] === '{') { lit += '{'; i++; continue; }
        if (s[i] === '}' && s[i + 1] === '}') { lit += '}'; i++; continue; }
        if (s[i] === '{') {
          const j = s.indexOf('}', i);
          if (j < 0) fail('f-string is missing a }');
          let ex = s.slice(i + 1, j);
          if (headerColon(ex) >= 0 || ex.includes('!')) unsupported('Formatting inside f-strings is not part of the pseudocode');
          if (lit) out.push({ t: 'str', v: lit, q: '"' });
          lit = '';
          out.push(fromPy(raw(ex)));
          i = j;
          continue;
        }
        lit += s[i];
      }
      if (lit) out.push({ t: 'str', v: lit, q: '"' });
      return out;
    }

    const prog = block(0);
    return { body: prog, errors, warnings };
  }
  PC.parsePython = parsePython;

  // ---------- writing Python ----------
  function printPython(stmts) {
    const consts = new Set(), zeroArg = new Set(), used = new Set();
    const warnings = [];
    const globalTypes = new Map();
    const walk = (list, f) => list.forEach((s) => {
      f(s);
      ['then', 'els', 'body', 'other'].forEach((k) => Array.isArray(s[k]) && walk(s[k], f));
      if (s.cases) s.cases.forEach((c) => walk(c.body, f));
    });
    walk(stmts, (s) => {
      if (s.k === 'const') consts.add(s.name);
      if ((s.k === 'proc' || s.k === 'func') && !s.params.length) zeroArg.add(s.name);
    });
    stmts.forEach((s) => { if (s.k === 'declare') globalTypes.set(s.name, s); });
    const topAssigned = new Set();
    stmts.forEach((s) => { if (s.k !== 'proc' && s.k !== 'func') assignedNames([s]).forEach((n) => topAssigned.add(n)); });

    const ctx = { consts, zeroArg, used };
    const E = (e) => print(e, 'py', ctx);
    const A = (e) => print(stripParen(e), 'py', ctx);
    const out = [];
    const pad = (n) => ' '.repeat(n);
    let scope = null; // local declarations/params of the current procedure
    const typeOf = (tgt) => {
      const name = tgt.t === 'index' ? tgt.e.v : tgt.v;
      const d = (scope && scope.get(name)) || globalTypes.get(name);
      return d ? d.type : null;
    };
    const handle = (f) => (f.t === 'str' ? f.v.replace(/\W+/g, '_').replace(/^(\d)/, '_$1') : (f.t === 'name' ? f.v + '_file' : 'file'));

    function line(ind, text, s) { out.push(pad(ind) + text + (s && s.comment != null ? `  # ${s.comment}` : '')); }
    function emit(list, ind) {
      const before = out.length;
      list.forEach((s) => one(s, ind));
      if (!out.slice(before).some((l) => l.trim() && !l.trim().startsWith('#'))) line(ind, 'pass');
    }
    function arrayInit(s) {
      const d = DEFAULT[s.type];
      const size = ([l, u]) => {
        const lv = intVal(stripParen(l));
        if (lv === 0) return E(addK(stripParen(u), 1));
        if (lv !== 1) warnings.push({ msg: `Array ${s.name} starts at index ${E(l)}; Python lists always start at 0, so the indexes below it are unused` });
        return `(${E(stripParen(u))} + 1)`;
      };
      if (s.dims.length === 1) return `[${d}] * ${size(s.dims[0])}`;
      return `[[${d}] * ${size(s.dims[1])} for _ in range(${size(s.dims[0])})]`;
    }
    function one(s, ind) {
      switch (s.k) {
        case 'blank': out.push(''); break;
        case 'comment': out.push(pad(ind) + '# ' + s.text); break;
        case 'declare':
          if (s.dims) line(ind, `${s.name} = ${arrayInit(s)}`, s);
          else line(ind, `${s.name}: ${TO_PY_TYPE[s.type]}`, s);
          break;
        case 'const': line(ind, `${PC.toUpperSnake(s.name)} = ${E(s.value)}`, s); break;
        case 'assign': line(ind, `${E(s.target)} = ${A(s.value)}`, s); break;
        case 'input': {
          const t = typeOf(s.target);
          const call = `input(${s.prompt ? A(s.prompt) : ''})`;
          line(ind, `${E(s.target)} = ` + (t === 'INTEGER' ? `int(${call})` : t === 'REAL' ? `float(${call})` : call), s);
          break;
        }
        case 'output':
          line(ind, `print(${s.values.map(A).join(', ')}${s.values.length > 1 ? ', sep=""' : ''})`, s); break;
        case 'if': {
          line(ind, `if ${A(s.cond)}:`, s);
          emit(s.then, ind + 4);
          let els = s.els;
          while (els && els.length === 1 && els[0].k === 'if' && els[0].comment == null) {
            line(ind, `elif ${A(els[0].cond)}:`);
            emit(els[0].then, ind + 4);
            els = els[0].els;
          }
          if (els) { line(ind, 'else:'); emit(els, ind + 4); }
          break;
        }
        case 'case':
          line(ind, `match ${A(s.subject)}:`, s);
          s.cases.forEach((c) => { line(ind + 4, `case ${E(c.value)}:`); emit(c.body, ind + 8); });
          if (s.other) { line(ind + 4, 'case _:'); emit(s.other, ind + 8); }
          break;
        case 'for': {
          const st = s.step ? intVal(stripParen(s.step)) : 1;
          if (s.step && st === null) warnings.push({ msg: `The STEP in FOR ${s.v} is not a number, so it is assumed to be positive` });
          const end = E(addK(stripParen(s.to), st !== null && st < 0 ? -1 : 1));
          const from = intVal(stripParen(s.from)) === 0 && !s.step ? '' : A(s.from) + ', ';
          line(ind, `for ${s.v} in range(${from}${end}${s.step ? ', ' + A(s.step) : ''}):`, s);
          emit(s.body, ind + 4);
          break;
        }
        case 'repeat':
          line(ind, 'while True:', s);
          s.body.forEach((b) => one(b, ind + 4));
          line(ind + 4, `if ${A(s.cond)}:`); line(ind + 8, 'break');
          break;
        case 'while': line(ind, `while ${A(s.cond)}:`, s); emit(s.body, ind + 4); break;
        case 'proc': case 'func': {
          const ps = s.params.map((p) => `${p.name}: ${TO_PY_TYPE[p.type]}`).join(', ');
          line(ind, `def ${s.name}(${ps})` + (s.k === 'func' ? ` -> ${TO_PY_TYPE[s.rtype]}` : '') + ':', s);
          const outer = scope;
          scope = new Map();
          s.params.forEach((p) => scope.set(p.name, p));
          walk(s.body, (b) => { if (b.k === 'declare') scope.set(b.name, b); });
          const globals = [...assignedNames(s.body)].filter((n) => !scope.has(n) && (globalTypes.has(n) || topAssigned.has(n)));
          if (globals.length) line(ind + 4, `global ${globals.join(', ')}`);
          emit(s.body, ind + 4);
          scope = outer;
          break;
        }
        case 'call': line(ind, `${s.name}(${s.args.map(A).join(', ')})`, s); break;
        case 'return': line(ind, `return ${A(s.value)}`, s); break;
        case 'open': line(ind, `${handle(s.file)} = open(${E(s.file)}, "${s.mode === 'READ' ? 'r' : 'w'}")`, s); break;
        case 'read': {
          const t = typeOf(s.target);
          const r = `${handle(s.file)}.readline()`;
          line(ind, `${E(s.target)} = ` + (t === 'INTEGER' ? `int(${r})` : t === 'REAL' ? `float(${r})` : `${r}.rstrip("\\n")`), s);
          break;
        }
        case 'write': {
          const t = s.value.t === 'name' || s.value.t === 'index' ? typeOf(s.value) : null;
          const str = s.value.t === 'str' || t === 'STRING' || t === 'CHAR';
          line(ind, `${handle(s.file)}.write(${str ? E(s.value) : `str(${A(s.value)})`} + "\\n")`, s);
          break;
        }
        case 'close': line(ind, `${handle(s.file)}.close()`, s); break;
        case 'bad': out.push(pad(ind) + `# COULD NOT CONVERT: ${s.text}`); break;
        default: out.push(pad(ind) + `# ? ${s.k}`);
      }
    }
    stmts.forEach((s) => one(s, 0));
    if (used.has('random')) out.unshift('import random', '');
    return { code: out.join('\n'), warnings };
  }

  function assignedNames(list) {
    const names = new Set();
    const visit = (l) => l.forEach((s) => {
      if ((s.k === 'assign' || s.k === 'input' || s.k === 'read') && s.target.t === 'name') names.add(s.target.v);
      if (s.k === 'for') names.add(s.v);
      if (s.k === 'proc' || s.k === 'func') return;
      ['then', 'els', 'body', 'other'].forEach((k) => Array.isArray(s[k]) && visit(s[k]));
      if (s.cases) s.cases.forEach((c) => visit(c.body));
    });
    visit(list);
    return names;
  }
  PC.assignedNames = assignedNames;
  PC.printPython = printPython;
})(typeof globalThis !== 'undefined' ? globalThis : this);
