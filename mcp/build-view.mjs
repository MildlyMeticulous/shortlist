import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const BUNDLE = path.join(ROOT, "node_modules", "@modelcontextprotocol", "ext-apps", "dist", "src", "app-with-deps.js");

if (!fs.existsSync(BUNDLE)) {
  console.error(`missing ${BUNDLE}\nrun: npm i @modelcontextprotocol/ext-apps`);
  process.exit(1);
}

const WANTED = ["App", "applyDocumentTheme", "applyHostStyleVariables", "applyHostFonts", "getDocumentTheme"];

let bundle = fs.readFileSync(BUNDLE, "utf8");

const tail = bundle.lastIndexOf("export{");
if (tail < 0) throw new Error("no export statement found in bundle");
const stmt = bundle.slice(tail);
const pairs = new Map();
for (const m of stmt.matchAll(/([A-Za-z_$][\w$]*) as ([A-Za-z_$][\w$]*)/g)) pairs.set(m[2], m[1]);

const missing = WANTED.filter(w => !pairs.has(w));
if (missing.length) throw new Error(`bundle does not export: ${missing.join(", ")}`);

const assign = WANTED.map(w => `${w}:${pairs.get(w)}`).join(",");
bundle = bundle.slice(0, tail) + `globalThis.__ext = {${assign}};`;

const ui = fs.readFileSync(path.join(HERE, "ui.js"), "utf8");
const css = fs.readFileSync(path.join(HERE, "ui.css"), "utf8");

const html = `<!doctype html>
<meta charset="utf-8">
<title>shortlist</title>
<style>${css}</style>
<div id="root"><div class="empty">Loading…</div></div>
<script type="module">
${bundle}
</script>
<script type="module">
${ui}
</script>
`;

const out = path.join(HERE, "app.html");
fs.writeFileSync(out, html);
console.log(`wrote ${path.relative(ROOT, out)}  ${(html.length / 1024).toFixed(0)}KB`);
console.log(`bundle exports resolved: ${WANTED.map(w => `${w}=${pairs.get(w)}`).join(" ")}`);
