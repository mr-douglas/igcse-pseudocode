// Shared expression handling for the Cambridge IGCSE 0478 pseudocode <-> Python converter.
// Expressions from both languages are parsed into one tree that uses the pseudocode's
// operators and library routines (DIV, MOD, LENGTH, LCASE, UCASE, SUBSTRING, ROUND, RANDOM).
(function (G) {
  'use strict';
  const PC = (G.PC = G.PC || {});

  class ConvError extends Error {
    constructor(msg, unsupported) { super(msg); this.unsupported = !!unsupported; }
  }
  PC.ConvError = ConvError;
  const fail = (m) => { throw new ConvError(m, false); };
  const unsupported = (m) => { throw new ConvError(m, true); };
  PC.fail = fail;
  PC.unsupported = unsupported;

  // ---------- tokenising ----------
  const OPS = {
    py: ['**', '//', '==', '!=', '<=', '>=', '<', '>', '=', '+', '-', '*', '/', '%', '(', ')', '[', ']', ',', ':', '.', '|', '{', '}'],
    ps: ['←', '<=', '>=', '<>', '<', '>', '=', '+', '-', '*', '/', '^', '(', ')', '[', ']', ',', ':', '.'],
  };
  const ESC = { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"' };

  function tokenize(s, lang) {
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t') { i++; continue; }
      const rest = s.slice(i);
      let m = /^(\d+\.\d*|\.\d+|\d+)/.exec(rest);
      if (m && !(lang === 'ps' && m[1].startsWith('.'))) {
        toks.push({ t: 'num', v: m[1] }); i += m[1].length; continue;
      }
      const fpre = lang === 'py' && (c === 'f' || c === 'F') && (s[i + 1] === '"' || s[i + 1] === "'");
      if (c === '"' || c === "'" || fpre) {
        if (fpre) i++;
        const q = s[i];
        if (lang === 'py' && s.startsWith(q + q + q, i)) unsupported('Triple-quoted strings are not part of the pseudocode');
        let j = i + 1, v = '';
        while (j < s.length && s[j] !== q) {
          if (lang === 'py' && s[j] === '\\' && j + 1 < s.length) {
            const e = s[j + 1];
            v += e in ESC ? ESC[e] : '\\' + e; j += 2; continue;
          }
          v += s[j]; j++;
        }
        if (j >= s.length) fail('A string is missing its closing quote');
        toks.push({ t: fpre ? 'fstr' : 'str', v, q }); i = j + 1; continue;
      }
      m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
      if (m) { toks.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
      const op = OPS[lang].find((o) => s.startsWith(o, i));
      if (!op) fail(`Unexpected character "${c}"`);
      toks.push({ t: 'op', v: op }); i += op.length;
    }
    return toks;
  }
  PC.tokenize = tokenize;

  // ---------- parsing ----------
  // Precedence (higher binds tighter). NOT = 3, unary minus = 7, atoms = 10.
  const PREC = { OR: 1, AND: 2, '=': 4, '<>': 4, '<': 4, '<=': 4, '>': 4, '>=': 4,
    '+': 5, '-': 5, '*': 6, '/': 6, DIV: 6, MOD: 6, '^': 8 };
  PC.PREC = PREC;
  const PY_BIN = { or: 'OR', and: 'AND', '==': '=', '!=': '<>', '<': '<', '<=': '<=', '>': '>', '>=': '>=',
    '+': '+', '-': '-', '*': '*', '/': '/', '//': 'DIV', '%': 'MOD', '**': '^' };
  const PS_BIN = { OR: 'OR', AND: 'AND', '=': '=', '<>': '<>', '<': '<', '<=': '<=', '>': '>', '>=': '>=',
    '+': '+', '-': '-', '*': '*', '/': '/', '^': '^' };

  class Parser {
    constructor(text, lang) { this.lang = lang; this.toks = tokenize(text, lang); this.i = 0; }
    peek(k = 0) { return this.toks[this.i + k]; }
    next() { return this.toks[this.i++]; }
    isOp(v) { const t = this.peek(); return !!t && t.t === 'op' && t.v === v; }
    isId(v) { const t = this.peek(); return !!t && t.t === 'id' && t.v === v; }
    expect(v) { if (!this.isOp(v)) fail(`Expected "${v}"`); return this.next(); }
    atEnd() { return this.i >= this.toks.length; }
    end() { if (!this.atEnd()) fail(`Unexpected "${this.peek().v}"`); }
    binop() {
      const t = this.peek();
      if (!t || (t.t !== 'op' && t.t !== 'id')) return null;
      if (this.lang === 'py') {
        if (t.t === 'id' && (t.v === 'in' || t.v === 'is' || t.v === 'not')) unsupported(`"${t.v}" is not a pseudocode operator`);
        if (t.t === 'id' && t.v === 'if') unsupported('Conditional expressions (x if c else y) are not part of the pseudocode');
      }
      const op = (this.lang === 'py' ? PY_BIN : PS_BIN)[t.v];
      if (!op || (t.t === 'id') !== /^[a-zA-Z]/.test(t.v)) return null;
      return { op, prec: PREC[op], right: op === '^' };
    }
    expr(min = 0) {
      let left = this.unary();
      for (;;) {
        const b = this.binop();
        if (!b || b.prec < min) break;
        this.next();
        left = { t: 'bin', op: b.op, l: left, r: this.expr(b.right ? b.prec : b.prec + 1) };
      }
      return left;
    }
    unary() {
      if (this.isId(this.lang === 'py' ? 'not' : 'NOT')) { this.next(); return { t: 'un', op: 'NOT', e: this.expr(4) }; }
      if (this.isOp('-')) { this.next(); return { t: 'un', op: '-', e: this.expr(7) }; }
      if (this.isOp('+')) { this.next(); return this.expr(7); }
      return this.postfix(this.primary());
    }
    primary() {
      const t = this.next();
      if (!t) fail('An expression is missing');
      if (t.t === 'num') return { t: 'num', v: t.v };
      if (t.t === 'str') return { t: 'str', v: t.v, q: t.q };
      if (t.t === 'fstr') return { t: 'fstr', v: t.v };
      if (t.t === 'id') {
        if (this.lang === 'py') {
          if (t.v === 'True' || t.v === 'False') return { t: 'bool', v: t.v === 'True' };
          if (t.v === 'lambda') unsupported('lambda is not part of the pseudocode');
        } else if (t.v === 'TRUE' || t.v === 'FALSE') return { t: 'bool', v: t.v === 'TRUE' };
        return { t: 'name', v: t.v };
      }
      if (t.v === '(') { const e = this.expr(); this.expect(')'); return { t: 'paren', e }; }
      if (t.v === '[' && this.lang === 'py') {
        const items = [];
        while (!this.isOp(']')) {
          items.push(this.expr());
          if (this.isId('for')) unsupported('List comprehensions are not part of the pseudocode');
          if (!this.isOp(']')) this.expect(',');
        }
        this.next();
        return { t: 'list', items };
      }
      if (t.v === '{') unsupported('Dictionaries and sets are not part of the pseudocode');
      fail(`Unexpected "${t.v}"`);
    }
    args(close) {
      const out = [];
      while (!this.isOp(close)) {
        if (this.atEnd()) fail(`Expected "${close}"`);
        if (this.lang === 'py' && this.peek().t === 'id' && this.peek(1) && this.peek(1).t === 'op' && this.peek(1).v === '=') {
          const name = this.next().v; this.next();
          out.push({ t: 'kw', name, e: this.expr() });
        } else out.push(this.expr());
        if (!this.isOp(close)) this.expect(',');
      }
      this.next();
      return out;
    }
    postfix(n) {
      for (;;) {
        if (this.isOp('(')) {
          if (n.t !== 'name' && n.t !== 'attr') fail('Only named procedures and functions can be called');
          this.next(); n = { t: 'call', f: n, args: this.args(')') };
        } else if (this.isOp('[')) {
          this.next();
          if (this.lang === 'py') {
            let a = null, b = null, slice = false;
            if (!this.isOp(':')) a = this.expr();
            if (this.isOp(':')) { slice = true; this.next(); if (!this.isOp(']')) b = this.expr(); }
            if (this.isOp(':')) unsupported('Slices with a step are not part of the pseudocode');
            this.expect(']');
            n = slice ? { t: 'slice', e: n, a, b } : { t: 'index', e: n, idx: [a] };
          } else {
            n = { t: 'index', e: n, idx: this.args(']') };
          }
        } else if (this.isOp('.') && this.lang === 'py') {
          this.next(); const id = this.next();
          if (!id || id.t !== 'id') fail('Expected a name after "."');
          n = { t: 'attr', e: n, name: id.v };
        } else return n;
      }
    }
    list() { // comma-separated expressions up to the end of the text
      const out = [];
      if (this.atEnd()) return out;
      for (;;) { out.push(this.expr()); if (this.atEnd()) break; this.expect(','); }
      return out;
    }
  }
  PC.Parser = Parser;
  PC.parseExpr = (text, lang) => { const p = new Parser(text, lang); const e = p.expr(); p.end(); return e; };

  // ---------- small helpers ----------
  const num = (k) => (k < 0 ? { t: 'un', op: '-', e: { t: 'num', v: String(-k) } } : { t: 'num', v: String(k) });
  function intVal(n) {
    if (!n) return null;
    if (n.t === 'num' && /^\d+$/.test(n.v)) return +n.v;
    if (n.t === 'un' && n.op === '-' && n.e.t === 'num' && /^\d+$/.test(n.e.v)) return -n.e.v;
    return null;
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // Splits n into base + k (k an integer). base is null when n is a plain integer.
  function decompose(n) {
    const v = intVal(n);
    if (v !== null) return [null, v];
    if (n.t === 'bin' && (n.op === '+' || n.op === '-')) {
      const r = intVal(n.r);
      if (r !== null) { const [b, k] = decompose(n.l); return [b, k + (n.op === '+' ? r : -r)]; }
    }
    return [n, 0];
  }
  function addK(n, k) {
    const [b, k0] = decompose(n);
    const tot = k0 + k;
    if (b === null) return num(tot);
    if (tot === 0) return b;
    return tot > 0 ? { t: 'bin', op: '+', l: b, r: num(tot) } : { t: 'bin', op: '-', l: b, r: num(-tot) };
  }
  function addE(a, b) {
    const [ba, ka] = decompose(a), [bb, kb] = decompose(b);
    if (ba === null) return addK(b, ka);
    if (bb === null) return addK(a, kb);
    return { t: 'bin', op: '+', l: a, r: b };
  }
  function subE(a, b) {
    const [ba, ka] = decompose(a), [bb, kb] = decompose(b);
    if (bb === null) return addK(a, -kb);
    if (same(ba, bb)) return num(ka - kb);
    return { t: 'bin', op: '-', l: a, r: b };
  }
  Object.assign(PC, { num, intVal, same, addK, addE, subE });

  // ---------- Python names and library routines -> pseudocode tree ----------
  function toPascal(n) {
    if (n.length === 1 || /^_+$/.test(n)) return n;
    return n.split('_').filter(Boolean)
      .map((p) => (/^[A-Z0-9]+$/.test(p) ? p[0] + p.slice(1).toLowerCase() : p[0].toUpperCase() + p.slice(1)))
      .join('');
  }
  const toUpperSnake = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
  PC.toPascal = toPascal;
  PC.toUpperSnake = toUpperSnake;

  const PY_BUILTINS = new Set(['int', 'float', 'str', 'bool', 'abs', 'max', 'min', 'sum', 'sorted', 'list', 'range',
    'print', 'input', 'open', 'type', 'isinstance', 'chr', 'ord', 'enumerate', 'zip', 'map', 'filter', 'dict', 'set',
    'tuple', 'reversed', 'any', 'all', 'pow', 'divmod', 'exit', 'quit', 'format', 'id', 'hex', 'bin', 'oct']);
  PC.PY_BUILTINS = PY_BUILTINS;

  const stripParen = (n) => (n && n.t === 'paren' ? n.e : n);

  // Converts a raw Python expression tree into the shared (pseudocode) form.
  function fromPy(n) {
    switch (n.t) {
      case 'num': case 'str': case 'bool': return n;
      case 'name': return { t: 'name', v: toPascal(n.v) };
      case 'paren': return { t: 'paren', e: fromPy(n.e) };
      case 'un': return { t: 'un', op: n.op, e: fromPy(n.e) };
      case 'bin': return { t: 'bin', op: n.op, l: fromPy(n.l), r: fromPy(n.r) };
      case 'index': {
        const inner = fromPy(n.e), idx = n.idx.map(fromPy);
        if (n.e.t === 'index') return { t: 'index', e: inner.e, idx: inner.idx.concat(idx) };
        return { t: 'index', e: inner, idx };
      }
      case 'slice': {
        const s = fromPy(n.e);
        const a = n.a ? fromPy(n.a) : num(0);
        const b = n.b ? fromPy(n.b) : { t: 'call', f: 'LENGTH', args: [s] };
        return { t: 'call', f: 'SUBSTRING', args: [s, addK(a, 1), subE(b, a)] };
      }
      case 'call': {
        if (n.args.some((a) => a.t === 'kw')) unsupported('Keyword arguments are not part of the pseudocode');
        if (n.f.t === 'attr') {
          const m = n.f.name;
          if (n.f.e.t === 'name' && n.f.e.v === 'random') {
            if (m === 'random' && !n.args.length) return { t: 'call', f: 'RANDOM', args: [] };
            unsupported(`random.${m}() is not part of the pseudocode (use RANDOM(), which gives a number from 0 to 1)`);
          }
          if ((m === 'lower' || m === 'upper') && !n.args.length) return { t: 'call', f: m === 'lower' ? 'LCASE' : 'UCASE', args: [fromPy(n.f.e)] };
          unsupported(`.${m}() is not part of the pseudocode`);
        }
        const args = n.args.map(fromPy);
        const f = n.f.v;
        if (f === 'len' && args.length === 1) return { t: 'call', f: 'LENGTH', args };
        if (f === 'round' && (args.length === 1 || args.length === 2)) return { t: 'call', f: 'ROUND', args: [args[0], args[1] || num(0)] };
        if (PY_BUILTINS.has(f)) unsupported(`${f}() is not part of the pseudocode`);
        return { t: 'call', f: toPascal(f), args };
      }
      case 'attr': unsupported(`.${n.name} is not part of the pseudocode`); break;
      case 'list': unsupported('Lists can only be used to set up an array, e.g. Scores = [0] * 10'); break;
      case 'fstr': unsupported('f-strings can only be used inside print()'); break;
      default: fail('Unrecognised expression');
    }
  }
  PC.fromPy = fromPy;

  // Pseudocode tree tidy-up: DIV(a, b) and MOD(a, b) become operators.
  function fromPs(n) {
    switch (n.t) {
      case 'paren': return { t: 'paren', e: fromPs(n.e) };
      case 'un': return { t: 'un', op: n.op, e: fromPs(n.e) };
      case 'bin': return { t: 'bin', op: n.op, l: fromPs(n.l), r: fromPs(n.r) };
      case 'index': return { t: 'index', e: fromPs(n.e), idx: n.idx.map(fromPs) };
      case 'call': {
        const args = n.args.map(fromPs), f = n.f.v;
        if ((f === 'DIV' || f === 'MOD') && args.length === 2) return { t: 'bin', op: f, l: stripParen(args[0]), r: stripParen(args[1]) };
        return { t: 'call', f, args };
      }
      default: return n;
    }
  }
  PC.fromPs = fromPs;
  PC.psExpr = (text) => fromPs(PC.parseExpr(text, 'ps'));
  PC.pyExpr = (text) => fromPy(PC.parseExpr(text, 'py'));

  // ---------- printing ----------
  function prec(n, lang) {
    if (n.t === 'bin') return lang === 'ps' && (n.op === 'DIV' || n.op === 'MOD') ? 10 : PREC[n.op];
    if (n.t === 'un') return n.op === 'NOT' ? 3 : 7;
    return 10;
  }
  function child(n, parent, side, lang, ctx) {
    const s = print(n, lang, ctx), p = prec(n, lang), pp = PREC[parent.op];
    const right = parent.op === '^';
    const wrap = p < pp || (p === pp && (right ? side === 'l' : side === 'r'));
    return wrap ? `(${s})` : s;
  }
  function quote(v, q, lang) {
    if (lang === 'ps') return q === "'" && v.length === 1 ? `'${v}'` : `"${v}"`;
    const qq = q === "'" && v.length === 1 ? "'" : '"';
    return qq + v.replace(/\\/g, '\\\\').replace(new RegExp(qq, 'g'), '\\' + qq).replace(/\n/g, '\\n').replace(/\t/g, '\\t') + qq;
  }
  const PY_OP = { '=': '==', '<>': '!=', AND: 'and', OR: 'or', '^': '**', DIV: '//', MOD: '%' };
  const recv = (n, ctx) => { const s = print(n, 'py', ctx); return prec(n, 'py') < 10 || n.t === 'num' ? `(${s})` : s; };

  // ctx (Python only): { consts:Set, zeroArg:Set, used:Set }
  function print(n, lang, ctx = {}) {
    const P = (x) => print(x, lang, ctx);
    const arg = (x) => P(stripParen(x));
    switch (n.t) {
      case 'num':
        if (lang === 'ps' && n.v.includes('.')) { let v = n.v; if (v.startsWith('.')) v = '0' + v; if (v.endsWith('.')) v += '0'; return v; }
        return n.v;
      case 'str': return quote(n.v, n.q, lang);
      case 'bool': return lang === 'ps' ? (n.v ? 'TRUE' : 'FALSE') : (n.v ? 'True' : 'False');
      case 'name':
        if (lang === 'py') {
          if (ctx.consts && ctx.consts.has(n.v)) return toUpperSnake(n.v);
          if (ctx.zeroArg && ctx.zeroArg.has(n.v)) return n.v + '()';
        }
        return n.v;
      case 'paren': return `(${P(n.e)})`;
      case 'un':
        if (n.op === '-') return '-' + (prec(n.e, lang) < 7 ? `(${P(n.e)})` : P(n.e));
        if (lang === 'ps') return 'NOT ' + (n.e.t === 'bin' && prec(n.e, lang) < 10 ? `(${P(n.e)})` : P(n.e));
        return 'not ' + (prec(n.e, lang) < 3 ? `(${P(n.e)})` : P(n.e));
      case 'bin':
        if (lang === 'ps' && (n.op === 'DIV' || n.op === 'MOD')) return `${n.op}(${arg(n.l)}, ${arg(n.r)})`;
        return `${child(n.l, n, 'l', lang, ctx)} ${lang === 'py' ? PY_OP[n.op] || n.op : n.op} ${child(n.r, n, 'r', lang, ctx)}`;
      case 'index':
        return P(n.e) + (lang === 'ps' ? `[${n.idx.map(arg).join(', ')}]` : n.idx.map((i) => `[${arg(i)}]`).join(''));
      case 'call': {
        const a = n.args;
        if (lang === 'ps') return `${n.f}(${a.map(arg).join(', ')})`;
        switch (n.f) {
          case 'LENGTH': if (a.length === 1) return `len(${arg(a[0])})`; break;
          case 'LCASE': if (a.length === 1) return `${recv(a[0], ctx)}.lower()`; break;
          case 'UCASE': if (a.length === 1) return `${recv(a[0], ctx)}.upper()`; break;
          case 'RANDOM': if (!a.length) { if (ctx.used) ctx.used.add('random'); return 'random.random()'; } break;
          case 'ROUND': if (a.length === 2) return intVal(a[1]) === 0 ? `round(${arg(a[0])})` : `round(${arg(a[0])}, ${arg(a[1])})`; break;
          case 'SUBSTRING': if (a.length === 3) {
            const start = addK(stripParen(a[1]), -1), end = addE(start, stripParen(a[2]));
            const s0 = intVal(start) === 0 ? '' : print(start, 'py', ctx);
            return `${recv(a[0], ctx)}[${s0}:${print(end, 'py', ctx)}]`;
          } break;
        }
        return `${n.f}(${a.map(arg).join(', ')})`;
      }
      default: fail('Cannot print expression');
    }
  }
  PC.print = print;
  PC.stripParen = stripParen;
})(typeof globalThis !== 'undefined' ? globalThis : this);
