// Renders the view against a stub host and real catalogue data, so the layout can be
// checked without a Claude host. Writes mcp/preview.html, which is not shipped.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "catalogue.json"), "utf8"));

const tally = {};
for (const p of catalogue.plugins) for (const c of p.categories) tally[c] = (tally[c] || 0) + 1;
const categories = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
const plugins = [...catalogue.plugins].sort((a, b) => b.stars - a.stars).slice(0, 40);

const stub = `
globalThis.__ext = {
  App: class {
    constructor() { this.hostContext = { theme: "light" }; }
    async connect() {
      setTimeout(() => this.ontoolresult?.({
        structuredContent: ${JSON.stringify({ total: catalogue.plugins.length, plugins, categories })}
      }), 0);
    }
    async callServerTool({ arguments: a }) {
      const all = ${JSON.stringify(catalogue.plugins)};
      const terms = (a.search || "").toLowerCase().split(/\\s+/).filter(Boolean);
      let rows = all;
      if (a.category) rows = rows.filter(p => p.categories.includes(a.category));
      if (terms.length) rows = rows.filter(p => terms.every(t =>
        (p.name + " " + p.description + " " + p.categories.join(" ")).toLowerCase().includes(t)));
      return { structuredContent: { total: rows.length, plugins: rows.slice(0, 60), categories: ${JSON.stringify(categories)} } };
    }
    async openLink() {}
  },
  applyDocumentTheme() {}, applyHostStyleVariables() {}, applyHostFonts() {}, getDocumentTheme: () => "light",
};`;

const html = `<!doctype html>
<meta charset="utf-8">
<title>shortlist preview</title>
<style>${fs.readFileSync(path.join(HERE, "ui.css"), "utf8")}</style>
<div id="root"><div class="empty">Loading…</div></div>
<script type="module">${stub}</script>
<script type="module">${fs.readFileSync(path.join(HERE, "ui.js"), "utf8")}</script>
`;
fs.writeFileSync(path.join(HERE, "preview.html"), html);
console.log(`wrote mcp/preview.html  ${(html.length / 1024).toFixed(0)}KB`);
