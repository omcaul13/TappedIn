// Every <video> in a document, open shadow roots included (some players render it inside web components).
// A function expression spliced into page scripts as `(<this file>)(document)`, here and in electron/main.cjs
// (through the shell provider file). Plain JS so nothing is transformed.
(root) => {
  const out = [];
  const walk = (r) => {
    for (const v of r.querySelectorAll('video')) out.push(v);
    for (const el of r.querySelectorAll('*')) if (el.shadowRoot) walk(el.shadowRoot);
  };
  walk(root);
  return out;
}
