import fs from "node:fs";
import { classifyAll } from "./categories.mjs";

const [pluginsPath, cachePath, outPath = "data/catalogue.json"] = process.argv.slice(2);
if (!pluginsPath || !cachePath) {
  console.error("usage: node build/build-catalogue.mjs <plugins.json> <repocache.json> [out]");
  process.exit(2);
}

const plugins = JSON.parse(fs.readFileSync(pluginsPath, "utf8"));
const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));

const DAY = 86400e3;
const now = Date.now();

const REJECT = [
  ["no repository resolved", p => !p.repo],
  ["repository unreachable", p => !cache[p.repo]],
  ["archived", p => cache[p.repo]?.archived],
  ["no license", p => { const l = cache[p.repo]?.license; return !l || l === "NOASSERTION"; }],
  ["untouched for 180 days", p => now - Date.parse(cache[p.repo]?.pushed ?? 0) > 180 * DAY],
];

const kept = [], rejected = [];
for (const p of plugins) {
  const reason = REJECT.find(([, test]) => { try { return test(p); } catch { return false; } });
  if (reason) { rejected.push({ name: p.name, repo: p.repo, reason: reason[0] }); continue; }
  const meta = cache[p.repo];
  kept.push({
    name: p.name,
    description: (p.description || "").replace(/\s+/g, " ").trim(),
    repo: p.repo,
    stars: meta.stars,
    forks: meta.forks,
    pushed: meta.pushed.slice(0, 10),
    license: meta.license,
    categories: classifyAll(`${p.name} ${p.description}`),
  });
}

const byRepo = {};
for (const k of kept) (byRepo[k.repo] ??= []).push(k);
for (const [repo, group] of Object.entries(byRepo))
  if (group.length > 1) for (const g of group) g.siblings = group.length;

kept.sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));

const catalogue = {
  source: "anthropics/claude-plugins-community",
  built: null,
  counts: { upstream: plugins.length, kept: kept.length, rejected: rejected.length },
  plugins: kept,
};
fs.mkdirSync(outPath.replace(/[/\\][^/\\]+$/, ""), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(catalogue, null, 1));
fs.writeFileSync(outPath.replace(/\.json$/, "-rejected.json"), JSON.stringify(rejected, null, 1));

const tally = {};
for (const [reason] of REJECT) tally[reason] = rejected.filter(r => r.reason === reason).length;

console.log(`upstream ${plugins.length}  kept ${kept.length}  rejected ${rejected.length}`);
for (const [k, v] of Object.entries(tally)) if (v) console.log(`  ${String(v).padStart(5)}  ${k}`);

const cats = {};
for (const k of kept) for (const c of k.categories) cats[c] = (cats[c] || 0) + 1;
console.log("\ncategories:");
for (const [c, n] of Object.entries(cats).sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(n).padStart(4)}  ${c}`);
