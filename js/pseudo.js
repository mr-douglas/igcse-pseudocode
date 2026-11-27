// Reads and writes Cambridge IGCSE 0478 pseudocode, as defined in the syllabus "Pseudocode" section.
(function (G) {
  'use strict';
  const PC = G.PC;
  const { fail, psExpr, print, Parser, fromPs } = PC;
  const TYPES = new Set(['INTEGER', 'REAL', 'CHAR', 'STRING', 'BOOLEAN']);

  function normalise(src) {
    return src.replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
      .replace(/[ꞌ‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—−]/g, '-')
      .replace(/≠/g, '<>').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/[⟵⇐]/g, '←');
  }
  PC.normalisePseudo = normalise;

  // Splits off a // comment that is not inside a string.
  function splitComment(line) {
    let q = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === q) q = null; continue; }
      if (c === '"' || (c === "'" && line[i + 2] === "'")) { q = c; continue; }
      if (c === '/' && line[i + 1] === '/') return [line.slice(0, i), line.slice(i + 2).replace(/^ /, '')];
    }
    return [line, null];
  }

  // Splits on top-level separators (outside brackets and strings).
  function splitTop(text, sep) {
    const out = []; let depth = 0, q = null, cur = '';
    for (const c of text) {
      if (q) { if (c === q) q = null; cur += c; continue; }
      if (c === '"' || c === "'") q = c;
      else if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) depth--;
      else if (c === sep && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  }
  PC.splitTop = splitTop;

  const expr = (t) => psExpr(t.trim());
  const ASSIGN = /^(.+?)\s*(?:←|<-)\s*(.+)$/;

  function target(text) {
    const e = expr(text);
    if (e.t !== 'name' && e.t !== 'index') fail('The left-hand side must be a variable or an array element');
    return e;
  }
  function fileRef(text) {
    text = text.trim();
    if (/^"[^"]*"$/.test(text)) return { t: 'str', v: text.slice(1, -1), q: '"' };
    if (/^[\w\-]+\.\w+$/.test(text)) return { t: 'str', v: text, q: '"' };
    return expr(text);
  }
  function params(text) {
    if (!text || !text.trim()) return [];
    return splitTop(text, ',').map((p) => {
      const m = /^(?:BYREF\s+|BYVAL\s+)?([A-Za-z]\w*)\s*:\s*([A-Z]+)$/.exec(p);
      if (!m) fail(`Parameters are written as Name : TYPE, not "${p}"`);
      if (!TYPES.has(m[2])) fail(`Unknown data type ${m[2]}`);
      return { name: m[1], type: m[2] };
    });
  }
  function dataType(t) {
    t = t.trim();
    const m = /^ARRAY\s*\[(.+)\]\s*OF\s+([A-Z]+)$/.exec(t);
    if (m) {
      if (!TYPES.has(m[2])) fail(`Unknown data type ${m[2]}`);
      const dims = splitTop(m[1], ',').map((d) => {
        const b = splitTop(d, ':');
        if (b.length !== 2) fail('Array bounds are written as [lower:upper]');
        return [expr(b[0]), expr(b[1])];
      });
      if (dims.length > 2) fail('Only 1D and 2D arrays are in the syllabus');
      return { type: m[2], dims };
    }
    if (!TYPES.has(t)) fail(`Unknown data type "${t}" (use INTEGER, REAL, CHAR, STRING or BOOLEAN)`);
    return { type: t, dims: null };
  }

  function parsePseudo(src) {
    const lines = normalise(src).split('\n').map((l, i) => {
      const [code, comment] = splitComment(l);
      return { no: i + 1, text: code.trim(), comment };
    });
    const errors = [];
    let pos = 0;
    const word = (L) => (/^([A-Z]+)\b/.exec(L.text) || [])[1];

    function block(terms, what) {
      const out = [];
      while (pos < lines.length) {
        const L = lines[pos];
        if (L.text === '') { out.push(L.comment !== null ? { k: 'comment', text: L.comment } : { k: 'blank' }); pos++; continue; }
        if (terms.includes(word(L))) return out;
        out.push(statement());
      }
      if (what) errors.push({ line: lines.length, msg: `${what} is missing` });
      return out;
    }
    const withComment = (s, L) => { if (L.comment !== null) s.comment = L.comment; return s; };

    function statement() {
      const L = lines[pos];
      try {
        const s = parseLine(L);
        return withComment(s, L);
      } catch (e) {
        if (!(e instanceof PC.ConvError)) throw e;
        errors.push({ line: L.no, msg: e.message });
        pos = Math.max(pos, lines.indexOf(L) + 1);
        return { k: 'bad', text: L.text, msg: e.message };
      }
    }

    // Parses the statement starting at lines[pos]; advances pos past it.
    function parseLine(L) {
      const t = L.text, w = word(L);
      let m;
      pos++;
      switch (w) {
        case 'DECLARE': {
          m = /^DECLARE\s+(.+?)\s*:\s*(.+)$/.exec(t);
          if (!m) fail('Write DECLARE <identifier> : <data type>');
          const names = splitTop(m[1], ',');
          const dt = dataType(m[2]);
          const decls = names.map((n) => ({ k: 'declare', name: n, type: dt.type, dims: dt.dims }));
          return decls.length === 1 ? decls[0] : { k: 'group', body: decls };
        }
        case 'CONSTANT':
          m = /^CONSTANT\s+([A-Za-z]\w*)\s*(?:←|<-|=)\s*(.+)$/.exec(t);
          if (!m) fail('Write CONSTANT <identifier> ← <value>');
          return { k: 'const', name: m[1], value: expr(m[2]) };
        case 'INPUT': return { k: 'input', target: target(t.slice(5)), prompt: null };
        case 'OUTPUT': case 'PRINT': {
          const p = new Parser(t.slice(w.length), 'ps');
          const values = p.list().map(fromPs);
          if (!values.length) fail('OUTPUT needs at least one value');
          return { k: 'output', values };
        }
        case 'IF': {
          m = /^IF\s+(.+?)(?:\s+THEN(?:\s+(.*))?)?$/.exec(t);
          if (!m) fail('Write IF <condition>');
          const cond = expr(m[1]);
          const then = [];
          if (!/\sTHEN(\s|$)/.test(t)) {
            while (pos < lines.length && lines[pos].text === '') { if (lines[pos].comment !== null) then.push({ k: 'comment', text: lines[pos].comment }); pos++; }
            if (pos >= lines.length || word(lines[pos]) !== 'THEN') fail('IF must be followed by THEN');
            const T = lines[pos];
            if (T.comment !== null) then.push({ k: 'comment', text: T.comment });
            const rest = T.text.slice(4).trim();
            if (rest) { lines[pos] = { no: T.no, text: rest, comment: null }; } else pos++;
          } else if (m[2]) {
            lines[pos - 1] = { no: L.no, text: m[2], comment: null }; pos--;
          }
          then.push(...block(['ELSE', 'ENDIF'], 'ENDIF'));
          let els = null;
          if (pos < lines.length && word(lines[pos]) === 'ELSE') {
            const E = lines[pos];
            els = [];
            if (E.comment !== null) els.push({ k: 'comment', text: E.comment });
            const rest = E.text.slice(4).trim();
            if (rest) lines[pos] = { no: E.no, text: rest, comment: null }; else pos++;
            els.push(...block(['ENDIF'], 'ENDIF'));
          }
          if (pos < lines.length) pos++;
          return { k: 'if', cond, then, els };
        }
        case 'CASE': {
          m = /^CASE\s+OF\s+(.+)$/.exec(t);
          if (!m) fail('Write CASE OF <identifier>');
          const s = { k: 'case', subject: expr(m[1]), cases: [], other: null };
          let cur = null;
          const LABEL = /^('.'|"[^"]*"|-?\s*\d+(?:\.\d+)?|TRUE|FALSE)\s*:\s*(.*)$/;
          while (pos < lines.length) {
            const C = lines[pos];
            if (C.text === '') { if (C.comment !== null && cur) cur.push({ k: 'comment', text: C.comment }); pos++; continue; }
            if (word(C) === 'ENDCASE') { pos++; return s; }
            if (word(C) === 'OTHERWISE') {
              const rest = C.text.slice(9).replace(/^\s*:/, '').trim();
              cur = s.other = [];
              if (rest) { lines[pos] = { no: C.no, text: rest, comment: C.comment }; } else pos++;
              continue;
            }
            const lm = LABEL.exec(C.text);
            if (lm && !s.other) {
              cur = [];
              s.cases.push({ value: expr(lm[1]), body: cur });
              if (lm[2]) lines[pos] = { no: C.no, text: lm[2], comment: C.comment }; else pos++;
              continue;
            }
            if (!cur) fail('Each case should start with a value and a colon, e.g. \'W\' : Position ← Position - 10');
            cur.push(statement());
          }
          fail('ENDCASE is missing');
        }
        // eslint-disable-next-line no-fallthrough
        case 'FOR': {
          m = /^FOR\s+([A-Za-z]\w*)\s*(?:←|<-|=)\s*(.+?)\s+TO\s+(.+?)(?:\s+STEP\s+(.+))?$/.exec(t);
          if (!m) fail('Write FOR <identifier> ← <value1> TO <value2>');
          const body = block(['NEXT'], 'NEXT ' + m[1]);
          if (pos < lines.length) {
            const n = /^NEXT(?:\s+(\w+))?$/.exec(lines[pos].text);
            if (n && n[1] && n[1] !== m[1]) errors.push({ line: lines[pos].no, msg: `NEXT ${n[1]} should be NEXT ${m[1]}` });
            pos++;
          }
          return { k: 'for', v: m[1], from: expr(m[2]), to: expr(m[3]), step: m[4] ? expr(m[4]) : null, body };
        }
        case 'REPEAT': {
          if (t !== 'REPEAT') fail('REPEAT should be on a line by itself');
          const body = block(['UNTIL'], 'UNTIL');
          let cond = { t: 'bool', v: true };
          if (pos < lines.length) { const U = lines[pos]; pos++; cond = expr(U.text.slice(5)); }
          return { k: 'repeat', body, cond };
        }
        case 'WHILE': {
          m = /^WHILE\s+(.+?)(?:\s+DO)?$/.exec(t);
          if (!m) fail('Write WHILE <condition> DO');
          const cond = expr(m[1]);
          const body = block(['ENDWHILE'], 'ENDWHILE');
          if (pos < lines.length) pos++;
          return { k: 'while', cond, body };
        }
        case 'PROCEDURE': {
          m = /^PROCEDURE\s+([A-Za-z]\w*)\s*(?:\((.*)\))?$/.exec(t);
          if (!m) fail('Write PROCEDURE <identifier>(<param> : <type>, ...)');
          const ps = params(m[2]);
          const body = block(['ENDPROCEDURE'], 'ENDPROCEDURE');
          if (pos < lines.length) pos++;
          return { k: 'proc', name: m[1], params: ps, body };
        }
        case 'FUNCTION': {
          m = /^FUNCTION\s+([A-Za-z]\w*)\s*(?:\((.*)\))?\s*RETURNS\s+([A-Z]+)$/.exec(t);
          if (!m) fail('Write FUNCTION <identifier>(<param> : <type>, ...) RETURNS <type>');
          if (!TYPES.has(m[3])) fail(`Unknown data type ${m[3]}`);
          const ps = params(m[2]);
          const body = block(['ENDFUNCTION'], 'ENDFUNCTION');
          if (pos < lines.length) pos++;
          return { k: 'func', name: m[1], params: ps, rtype: m[3], body };
        }
        case 'RETURN': return { k: 'return', value: expr(t.slice(6)) };
        case 'CALL': {
          const e = expr(t.slice(4));
          if (e.t === 'name') return { k: 'call', name: e.v, args: [] };
          if (e.t === 'call') return { k: 'call', name: e.f, args: e.args };
          fail('Write CALL <identifier>(<values>)');
        }
        // eslint-disable-next-line no-fallthrough
        case 'OPENFILE':
          m = /^OPENFILE\s+(.+?)\s+FOR\s+(READ|WRITE)$/.exec(t);
          if (!m) fail('Write OPENFILE <file identifier> FOR READ (or WRITE)');
          return { k: 'open', file: fileRef(m[1]), mode: m[2] };
        case 'READFILE': case 'WRITEFILE': {
          const parts = splitTop(t.slice(w.length), ',');
          if (parts.length !== 2) fail(`Write ${w} <file identifier>, <variable>`);
          return w === 'READFILE' ? { k: 'read', file: fileRef(parts[0]), target: target(parts[1]) }
            : { k: 'write', file: fileRef(parts[0]), value: expr(parts[1]) };
        }
        case 'CLOSEFILE': return { k: 'close', file: fileRef(t.slice(9)) };
        case 'THEN': case 'ELSE': case 'ENDIF': case 'NEXT': case 'UNTIL': case 'ENDWHILE': case 'ENDCASE':
        case 'ENDPROCEDURE': case 'ENDFUNCTION': case 'OTHERWISE':
          fail(`${w} without a matching start of the statement`);
      }
      m = ASSIGN.exec(t);
      if (m) return { k: 'assign', target: target(m[1]), value: expr(m[2]) };
      if (/^[A-Za-z]\w*\s*(\[.*\])?\s*=[^=]/.test(t)) fail('Use ← (or type <-) for assignment, not =');
      fail(`Not a pseudocode statement: "${t}"`);
    }

    const body = block([], null);
    // Flatten DECLARE groups.
    const flat = (list) => list.flatMap((s) => {
      if (s.k === 'group') return s.body;
      for (const key of ['then', 'els', 'body', 'other']) if (Array.isArray(s[key])) s[key] = flat(s[key]);
      if (s.cases) s.cases.forEach((c) => { c.body = flat(c.body); });
      return [s];
    });
    return { body: flat(body), errors };
  }
  PC.parsePseudo = parsePseudo;

  // ---------- printing pseudocode ----------
  function printPseudo(stmts) {
    const out = [];
    const E = (e) => print(e, 'ps');
    const A = (e) => print(PC.stripParen(e), 'ps');
    const pad = (n) => ' '.repeat(n);
    function emit(list, ind) { for (const s of list) one(s, ind); }
    function line(ind, text, s) { out.push(pad(ind) + text + (s && s.comment != null ? `  // ${s.comment}` : '')); }
    function one(s, ind) {
      switch (s.k) {
        case 'blank': out.push(''); break;
        case 'comment': out.push(pad(ind) + '// ' + s.text); break;
        case 'declare':
          line(ind, `DECLARE ${s.name} : ` + (s.dims ? `ARRAY[${s.dims.map(([l, u]) => `${A(l)}:${A(u)}`).join(', ')}] OF ${s.type}` : s.type), s);
          break;
        case 'const': line(ind, `CONSTANT ${s.name} ← ${E(s.value)}`, s); break;
        case 'assign': line(ind, `${E(s.target)} ← ${A(s.value)}`, s); break;
        case 'input':
          if (s.prompt) line(ind, `OUTPUT ${E(s.prompt)}`);
          line(ind, `INPUT ${E(s.target)}`, s); break;
        case 'output': line(ind, `OUTPUT ${s.values.map(A).join(', ')}`, s); break;
        case 'if':
          line(ind, `IF ${A(s.cond)}`, s);
          line(ind + 2, 'THEN'); emit(s.then, ind + 4);
          if (s.els) { line(ind + 2, 'ELSE'); emit(s.els, ind + 4); }
          line(ind, 'ENDIF'); break;
        case 'case': {
          line(ind, `CASE OF ${E(s.subject)}`, s);
          const clause = (label, body) => {
            const first = [];
            const keep = out.length;
            if (body.length) { one(body[0], 0); first.push(...out.splice(keep)); }
            if (first.length === 1) line(ind + 2, `${label} ${first[0]}`);
            else { line(ind + 2, label.replace(/ :$/, ' :')); first.forEach((l) => out.push(pad(ind + 4) + l)); }
            emit(body.slice(1), ind + 4);
          };
          s.cases.forEach((c) => clause(`${E(c.value)} :`, c.body));
          if (s.other) clause('OTHERWISE', s.other);
          line(ind, 'ENDCASE'); break;
        }
        case 'for':
          line(ind, `FOR ${s.v} ← ${A(s.from)} TO ${A(s.to)}` + (s.step ? ` STEP ${A(s.step)}` : ''), s);
          emit(s.body, ind + 4); line(ind, `NEXT ${s.v}`); break;
        case 'repeat': line(ind, 'REPEAT', s); emit(s.body, ind + 4); line(ind, `UNTIL ${A(s.cond)}`); break;
        case 'while': line(ind, `WHILE ${A(s.cond)} DO`, s); emit(s.body, ind + 4); line(ind, 'ENDWHILE'); break;
        case 'proc': case 'func': {
          const ps = s.params.length ? `(${s.params.map((p) => `${p.name} : ${p.type}`).join(', ')})` : '';
          const kw = s.k === 'proc' ? 'PROCEDURE' : 'FUNCTION';
          line(ind, `${kw} ${s.name}${ps}` + (s.k === 'func' ? ` RETURNS ${s.rtype}` : ''), s);
          emit(s.body, ind + 4); line(ind, 'END' + kw); break;
        }
        case 'call': line(ind, `CALL ${s.name}` + (s.args.length ? `(${s.args.map(A).join(', ')})` : ''), s); break;
        case 'return': line(ind, `RETURN ${A(s.value)}`, s); break;
        case 'open': line(ind, `OPENFILE ${E(s.file)} FOR ${s.mode}`, s); break;
        case 'read': line(ind, `READFILE ${E(s.file)}, ${E(s.target)}`, s); break;
        case 'write': line(ind, `WRITEFILE ${E(s.file)}, ${A(s.value)}`, s); break;
        case 'close': line(ind, `CLOSEFILE ${E(s.file)}`, s); break;
        case 'bad': out.push(pad(ind) + `// NOT IN THE 0478 PSEUDOCODE: ${s.text}`); break;
        default: out.push(pad(ind) + `// ? ${s.k}`);
      }
    }
    emit(stmts, 0);
    return out.join('\n');
  }
  PC.printPseudo = printPseudo;
})(typeof globalThis !== 'undefined' ? globalThis : this);
