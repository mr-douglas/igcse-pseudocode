// Top-level conversions. Python -> pseudocode also works out the DECLARE statements,
// constants, parameter types and return types that the pseudocode needs but Python leaves out.
(function (G) {
  'use strict';
  const PC = G.PC;
  const { intVal } = PC;
  const CMP = new Set(['=', '<>', '<', '<=', '>', '>=', 'AND', 'OR']);
  const KIDS = ['then', 'els', 'body', 'other'];

  function typeOf(e, env, funcs) {
    switch (e.t) {
      case 'num': return e.v.includes('.') ? 'REAL' : 'INTEGER';
      case 'str': return e.q === "'" && e.v.length === 1 ? 'CHAR' : 'STRING';
      case 'bool': return 'BOOLEAN';
      case 'name': { const d = env.get(e.v); return d && !d.dims ? d.type : null; }
      case 'paren': return typeOf(e.e, env, funcs);
      case 'un': return e.op === 'NOT' ? 'BOOLEAN' : typeOf(e.e, env, funcs);
      case 'index': { const d = env.get(e.e.v); return d ? d.type : null; }
      case 'bin': {
        if (CMP.has(e.op)) return 'BOOLEAN';
        if (e.op === 'DIV' || e.op === 'MOD') return 'INTEGER';
        if (e.op === '/') return 'REAL';
        const a = typeOf(e.l, env, funcs), b = typeOf(e.r, env, funcs);
        if (a === 'STRING' || b === 'STRING' || a === 'CHAR' || b === 'CHAR') return 'STRING';
        if (a === 'REAL' || b === 'REAL') return 'REAL';
        if (a === 'INTEGER' && b === 'INTEGER') return 'INTEGER';
        return a || b;
      }
      case 'call':
        switch (e.f) {
          case 'LENGTH': return 'INTEGER';
          case 'LCASE': case 'UCASE': return typeOf(e.args[0], env, funcs) === 'CHAR' ? 'CHAR' : 'STRING';
          case 'SUBSTRING': return 'STRING';
          case 'ROUND': return intVal(e.args[1]) === 0 ? 'INTEGER' : 'REAL';
          case 'RANDOM': return 'REAL';
          default: return funcs.has(e.f) ? funcs.get(e.f).rtype : null;
        }
      default: return null;
    }
  }

  // Records the type of every variable assigned in a list of statements (not inside procedures).
  function collect(list, env, found, funcs, skip) {
    const note = (name, type, s) => {
      if (skip.has(name)) return;
      const d = env.get(name);
      if (!d) { const nd = { type, line: s.line }; env.set(name, nd); found.set(name, nd); }
      else if (!d.declared && ((!d.type && type) || (d.type === 'INTEGER' && type === 'REAL'))) d.type = type;
    };
    for (const s of list) {
      switch (s.k) {
        case 'declare': env.set(s.name, { type: s.type, dims: s.dims, declared: true }); skip.add(s.name); break;
        case 'assign': if (s.target.t === 'name') note(s.target.v, typeOf(s.value, env, funcs), s); break;
        case 'input': if (s.target.t === 'name') note(s.target.v, s.cast === 'int' ? 'INTEGER' : s.cast === 'float' ? 'REAL' : 'STRING', s); break;
        case 'read': if (s.target.t === 'name') note(s.target.v, s.cast === 'int' ? 'INTEGER' : s.cast === 'float' ? 'REAL' : 'STRING', s); break;
        case 'for': note(s.v, 'INTEGER', s); break;
      }
      if (s.k === 'proc' || s.k === 'func') continue;
      KIDS.forEach((k) => Array.isArray(s[k]) && collect(s[k], env, found, funcs, skip));
      if (s.cases) s.cases.forEach((c) => collect(c.body, env, found, funcs, skip));
    }
  }

  function calls(list, f) {
    const ex = (e) => {
      if (!e || typeof e !== 'object') return;
      if (e.t === 'call') f(e.f, e.args);
      ['e', 'l', 'r'].forEach((k) => e[k] && ex(e[k]));
      (e.args || []).forEach(ex); (e.idx || []).forEach(ex);
    };
    const st = (l) => l.forEach((s) => {
      if (s.k === 'call') f(s.name, s.args);
      ['value', 'cond', 'target', 'subject', 'from', 'to', 'prompt'].forEach((k) => ex(s[k]));
      (s.values || []).forEach(ex); (s.args || []).forEach(ex);
      KIDS.forEach((k) => Array.isArray(s[k]) && st(s[k]));
      if (s.cases) s.cases.forEach((c) => st(c.body));
    });
    st(list);
  }

  function addDeclarations(prog, warnings) {
    // Constants: module-level NAME_IN_CAPITALS assigned a literal exactly once.
    const counts = new Map();
    const countAll = (l) => l.forEach((s) => {
      if ((s.k === 'assign' || s.k === 'input' || s.k === 'read') && s.target.t === 'name') counts.set(s.target.v, (counts.get(s.target.v) || 0) + 1);
      if (s.k === 'for') counts.set(s.v, 2);
      KIDS.forEach((k) => Array.isArray(s[k]) && countAll(s[k]));
      if (s.cases) s.cases.forEach((c) => countAll(c.body));
    });
    countAll(prog);
    const isLit = (v) => ['num', 'str', 'bool'].includes(v.t) || (v.t === 'un' && v.op === '-' && v.e.t === 'num');
    prog.forEach((s, i) => {
      if (s.k === 'assign' && s.pyName && /^[A-Z][A-Z0-9_]+$/.test(s.pyName) && isLit(s.value) && counts.get(s.target.v) === 1) {
        prog[i] = { k: 'const', name: s.target.v, value: s.value, comment: s.comment };
      }
    });
    const consts = new Set(prog.filter((s) => s.k === 'const').map((s) => s.name));

    const funcs = new Map();
    prog.forEach((s) => { if (s.k === 'proc' || s.k === 'func') funcs.set(s.name, s); });

    // Pass 1: global variable types (function results unknown yet).
    let genv = new Map(), gfound = new Map();
    consts.forEach((c) => genv.set(c, { type: typeOf(prog.find((s) => s.k === 'const' && s.name === c).value, genv, funcs) }));
    collect(prog, genv, gfound, funcs, new Set(consts));

    // Parameter types from annotations, otherwise from the values passed in calls.
    calls(prog, (name, args) => {
      const f = funcs.get(name);
      if (!f) return;
      f.params.forEach((p, i) => { if (!p.type && args[i]) p.type = typeOf(args[i], genv, funcs); });
    });

    // Each procedure / function: local declarations and the return type.
    for (const f of funcs.values()) {
      const env = new Map(genv), found = new Map();
      f.params.forEach((p) => {
        if (!p.type) { p.type = 'INTEGER'; warnings.push({ line: f.line, msg: `Could not work out the type of parameter ${p.name}; INTEGER assumed` }); }
        env.set(p.name, { type: p.type });
      });
      const skip = new Set([...f.params.map((p) => p.name), ...(f.globals || [])]);
      // Names only read (never assigned) refer to globals; assigned names are local unless declared global.
      const assigned = PC.assignedNames(f.body);
      for (const n of assigned) if (!skip.has(n)) env.delete(n);
      collect(f.body, env, found, funcs, skip);
      if (f.k === 'func' && !f.rtype) {
        const rets = [];
        const findRet = (l) => l.forEach((s) => { if (s.k === 'return') rets.push(s.value); KIDS.forEach((k) => Array.isArray(s[k]) && findRet(s[k])); if (s.cases) s.cases.forEach((c) => findRet(c.body)); });
        findRet(f.body);
        f.rtype = rets.map((r) => typeOf(r, env, funcs)).find(Boolean) || null;
        if (!f.rtype) { f.rtype = 'INTEGER'; warnings.push({ line: f.line, msg: `Could not work out what type ${f.name} returns; INTEGER assumed` }); }
      }
      const decls = declares(found, warnings);
      f.body.unshift(...decls);
    }

    // Pass 2: global types now that function return types are known.
    genv = new Map(); gfound = new Map();
    consts.forEach((c) => genv.set(c, { type: 'INTEGER' }));
    collect(prog, genv, gfound, funcs, new Set(consts));
    const decls = declares(gfound, warnings);
    if (decls.length) {
      let at = 0;
      while (at < prog.length && (prog[at].k === 'comment' || prog[at].k === 'blank')) at++;
      while (at < prog.length && (prog[at].k === 'const' || prog[at].k === 'declare')) at++;
      // Keep the declarations next to any existing constants/declarations near the top.
      prog.splice(at, 0, ...decls);
      if (at < prog.length - decls.length && prog[at + decls.length].k !== 'blank') prog.splice(at + decls.length, 0, { k: 'blank' });
    }
    return prog;
  }

  function declares(found, warnings) {
    const out = [];
    for (const [name, d] of found) {
      if (d.declared) continue;
      if (!d.type) { d.type = 'INTEGER'; warnings.push({ line: d.line, msg: `Could not work out the type of ${name}; INTEGER assumed` }); }
      out.push({ k: 'declare', name, type: d.type, dims: null });
    }
    return out;
  }

  function pythonToPseudo(src) {
    const r = PC.parsePython(src);
    const warnings = r.warnings.slice();
    let body = r.body;
    while (body.length && body[0].k === 'blank') body.shift();
    try { body = addDeclarations(body, warnings); } catch (e) { r.errors.push({ line: 0, msg: 'Type check failed: ' + e.message }); }
    return { code: PC.printPseudo(body), errors: r.errors, warnings };
  }

  function pseudoToPython(src) {
    const r = PC.parsePseudo(src);
    const p = PC.printPython(r.body);
    return { code: p.code, errors: r.errors, warnings: p.warnings };
  }

  PC.pythonToPseudo = pythonToPseudo;
  PC.pseudoToPython = pseudoToPython;
})(typeof globalThis !== 'undefined' ? globalThis : this);
