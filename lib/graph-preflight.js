// Advisory early check matching GhBridge/ArchivePolicy.cs's closed grammar.
// The worker remains authoritative; this never evaluates user/model expressions.
export function arithmeticExpressionAllowed(text) {
  if (typeof text !== "string" || text.length > 256) return false;
  if (!text.trim()) return true;
  let at = 0;
  const space = () => { while (at < text.length && /\s/u.test(text[at])) at++; };
  function atom(depth) {
    if (depth > 32) return false;
    space();
    if (at === text.length) return false;
    if (text[at] === "+" || text[at] === "-") { at++; return atom(depth + 1); }
    if (text[at] === "(") {
      at++;
      if (!expression(depth + 1)) return false;
      space();
      if (text[at] !== ")") return false;
      at++;
      return true;
    }
    if (text[at] === "x") { at++; return true; }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(text.slice(at));
    if (!match || !Number.isFinite(Number(match[0]))) return false;
    at += match[0].length;
    return true;
  }
  function expression(depth) {
    if (depth > 32 || !atom(depth + 1)) return false;
    space();
    while (at < text.length && "+-*/%^".includes(text[at])) {
      at++;
      if (!atom(depth + 1)) return false;
      space();
    }
    return true;
  }
  if (!expression(0)) return false;
  space();
  return at === text.length;
}

export function preflightGraphEdits(edits) {
  return edits.flatMap((edit, index) =>
    edit.op === "expression" && !arithmeticExpressionAllowed(edit.text)
      ? [`Edit ${index + 1}, node ${edit.nodeId}, input ${edit.input}: unsupported expression. Use x, finite numbers, parentheses and + - * / % ^, at most 256 characters. Functions such as Sqrt(x) are not enabled; for nonnegative x use x^0.5. No Compute test was used.`]
      : [],
  ).slice(0, 8);
}
