# IGCSE Pseudocode ⇄ Python

**https://mr-douglas.github.io/igcse-pseudocode/**

Two boxes side by side: type Cambridge IGCSE Computer Science (0478) pseudocode on the left or Python on the right, and the other box updates as you type.

It sticks to the pseudocode defined in the syllabus pseudocode guide:

- `DECLARE`, `CONSTANT`, `←`, 1D/2D `ARRAY[l:u] OF <type>`
- `INPUT`, `OUTPUT`
- arithmetic `+ - * / ^`, `DIV`, `MOD`; comparisons `= <> < <= > >=`; `AND OR NOT`
- `LENGTH`, `LCASE`, `UCASE`, `SUBSTRING`, `ROUND`, `RANDOM`
- `IF … THEN … ELSE … ENDIF`, `CASE OF … OTHERWISE … ENDCASE`
- `FOR … TO … STEP … NEXT`, `REPEAT … UNTIL`, `WHILE … DO … ENDWHILE`
- `PROCEDURE`/`CALL`, `FUNCTION … RETURNS`/`RETURN`
- `OPENFILE … FOR READ/WRITE`, `READFILE`, `WRITEFILE`, `CLOSEFILE`
- `//` comments

Python with no pseudocode equivalent is flagged rather than guessed. When Python becomes pseudocode, `DECLARE` statements, parameter types and return types are worked out from the code (type hints are used if present), `snake_case` becomes `PascalCase`, and `CAPITALS` names given one value become constants.

Everything runs in the browser (plain HTML/JS, no build step).

## Files

- `js/expr.js` – expression tokeniser, parser and printers
- `js/pseudo.js` – pseudocode reader/writer
- `js/python.js` – Python reader/writer
- `js/convert.js` – type inference and the two conversions
- `js/examples.js` – examples based on the syllabus guide
- `test/` – `node test/run.js` converts every example both ways, checks round trips and runs the generated Python; `node test/fuzz.js` converts every prefix of every example (as if being typed); `test/browser.cjs` is the Chromium check used in CI.

Pushing to `main` runs the tests and publishes the site to the `gh-pages` branch.
