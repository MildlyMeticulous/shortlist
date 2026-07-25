import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "catalogue.json"), "utf8"));

try {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "validation.json"), "utf8"));
  const fails = {};
  for (const r of v.results) {
    const e = r.problems.find(p => p.level === "error");
    if (e) fails[r.name] = e.code;
  }
  for (const p of catalogue.plugins) if (fails[p.name]) p.fails = fails[p.name];
} catch {}

const tally = {};
for (const p of catalogue.plugins) for (const c of p.categories) tally[c] = (tally[c] || 0) + 1;
const categories = Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
const plugins = [...catalogue.plugins].sort((a, b) => b.stars - a.stars).slice(0, 40);

const readJson = (...parts) => {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", ...parts), "utf8")); }
  catch { return null; }
};

const seen = readJson("shortlist", "seen.json")?.names;
if (Array.isArray(seen)) {
  const known = new Set(seen);
  const fresh = catalogue.plugins.filter(p => !known.has(p.name));
  if (fresh.length < catalogue.plugins.length) for (const p of fresh) p.new = true;
}

const installedState = readJson("plugins", "installed_plugins.json");
const enabledState = readJson("settings.json")?.enabledPlugins ?? {};
const installed = Object.entries(installedState?.plugins ?? {}).map(([id, versions]) => {
  const latest = versions[versions.length - 1] ?? {};
  const [name, marketplace] = id.split("@");
  return { id, name, marketplace, version: latest.version, scope: latest.scope, installedAt: latest.installedAt, enabled: enabledState[id] === true };
});

const marketplace = {
  marketplace: "claude-community",
  marketplaceSource: "anthropics/claude-plugins-community",
  marketplaceReady: process.argv.includes("--marketplace-ready"),
  installed,
};

const here = new Set(installed.filter(p => p.marketplace === marketplace.marketplace).map(p => p.name));
const initialCounts = {
  all: catalogue.plugins.length,
  new: catalogue.plugins.filter(p => p.new).length,
  installed: catalogue.plugins.filter(p => here.has(p.name)).length,
  enabled: catalogue.plugins.filter(p => here.has(p.name)).length,
  disabled: 0,
};

const stub = `
globalThis.__sent = [];
globalThis.__ext = {
  App: class {
    constructor() { this.hostContext = { theme: "light" }; }
    async sendMessage(params) {
      globalThis.__sent.push(params);
      const log = document.getElementById("sent") || (() => {
        const d = document.createElement("pre");
        d.id = "sent";
        d.style.cssText = "position:fixed;bottom:0;left:0;right:0;max-height:30vh;overflow:auto;margin:0;padding:8px;background:#111;color:#0f0;font:12px monospace;z-index:9";
        document.body.appendChild(d);
        return d;
      })();
      log.textContent += params.role + ": " + params.content.map(c => c.text).join(" ") + "\\n";
      return {};
    }
    async connect() {
      setTimeout(() => this.ontoolresult?.({
        structuredContent: ${JSON.stringify({ total: catalogue.plugins.length, plugins, categories, counts: initialCounts, ...marketplace })}
      }), 0);
    }
    async callServerTool({ arguments: a }) {
      const all = ${JSON.stringify(catalogue.plugins)};
      const info = ${JSON.stringify(marketplace)};
      const here = new Set(info.installed.filter(p => p.marketplace === info.marketplace).map(p => p.name));
      const on = new Set(info.installed.filter(p => p.marketplace === info.marketplace && p.enabled).map(p => p.name));
      const terms = (a.search || "").toLowerCase().split(/\\s+/).filter(Boolean);
      let rows = all;
      if (a.category) rows = rows.filter(p => p.categories.includes(a.category));
      if (terms.length) rows = rows.filter(p => terms.every(t =>
        (p.name + " " + p.description + " " + p.categories.join(" ")).toLowerCase().includes(t)));
      const counts = {
        all: rows.length,
        new: rows.filter(p => p.new).length,
        installed: rows.filter(p => here.has(p.name)).length,
        enabled: rows.filter(p => on.has(p.name)).length,
      };
      counts.disabled = counts.installed - counts.enabled;
      if (a.filter === "new") rows = rows.filter(p => p.new);
      else if (a.filter === "installed") rows = rows.filter(p => here.has(p.name));
      else if (a.filter === "enabled") rows = rows.filter(p => on.has(p.name));
      else if (a.filter === "disabled") rows = rows.filter(p => here.has(p.name) && !on.has(p.name));
      return { structuredContent: { total: rows.length, plugins: rows.slice(0, 60), counts, categories: ${JSON.stringify(categories)}, ...info } };
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
