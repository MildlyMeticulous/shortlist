#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const RESOURCE_MIME = "application/vnd.modelcontextprotocol.app+html";
const RESOURCE_URI = "ui://shortlist/app.html";

const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "catalogue.json"), "utf8"));
const PLUGINS = catalogue.plugins;

const CHECKS = {};
try {
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "validation.json"), "utf8"));
  for (const r of v.results) {
    const errors = r.problems.filter(p => p.level === "error");
    if (errors.length) CHECKS[r.name] = errors[0].code;
  }
} catch {}

const MARKETPLACE = "claude-community";
const MARKETPLACE_SOURCE = "anthropics/claude-plugins-community";

const marketplaceReady = () => {
  try {
    const known = path.join(os.homedir(), ".claude", "plugins", "known_marketplaces.json");
    return Object.keys(JSON.parse(fs.readFileSync(known, "utf8"))).includes(MARKETPLACE);
  } catch {
    return false;
  }
};

const readJson = (...parts) => {
  try { return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".claude", ...parts), "utf8")); }
  catch { return null; }
};

const installed = () => {
  const state = readJson("plugins", "installed_plugins.json");
  if (!state?.plugins) return [];
  const enabled = readJson("settings.json")?.enabledPlugins ?? {};
  return Object.entries(state.plugins).map(([id, versions]) => {
    const latest = versions[versions.length - 1] ?? {};
    const [name, marketplace] = id.split("@");
    return {
      id, name, marketplace,
      version: latest.version ?? null,
      scope: latest.scope ?? null,
      installedAt: latest.installedAt ?? null,
      enabled: enabled[id] === true,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
};

const categories = () => {
  const t = {};
  for (const p of PLUGINS) for (const c of p.categories) t[c] = (t[c] || 0) + 1;
  return Object.entries(t).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
};

function query({ search = "", category = "", minStars = 0, limit = 60 } = {}) {
  const terms = String(search).toLowerCase().split(/\s+/).filter(Boolean);
  let rows = PLUGINS;
  if (category) rows = rows.filter(p => p.categories.includes(category));
  if (minStars) rows = rows.filter(p => p.stars >= minStars);
  if (terms.length) {
    rows = rows.filter(p => {
      const hay = `${p.name} ${p.description} ${p.categories.join(" ")}`.toLowerCase();
      return terms.every(t => hay.includes(t));
    });
  }
  const sorted = [...rows].sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name));
  const page = sorted.slice(0, limit).map(p => CHECKS[p.name] ? { ...p, fails: CHECKS[p.name] } : p);
  return { total: rows.length, plugins: page };
}

const TOOL = {
  name: "browse_plugins",
  title: "Browse Claude Code plugins",
  description:
    "Open a browsable view of the Claude Code plugin catalogue, filtered and grouped into categories. "
    + "Use when the user wants to explore what plugins exist, or asks to see plugins for a topic. "
    + "Returns the matching plugins and renders an interactive list.",
  inputSchema: {
    type: "object",
    properties: {
      search: { type: "string", description: "words to match against name, description and category" },
      category: { type: "string", description: "restrict to one category" },
      minStars: { type: "number", description: "minimum star count" },
    },
  },
  _meta: { ui: { resourceUri: RESOURCE_URI } },
};

const send = msg => process.stdout.write(JSON.stringify(msg) + "\n");
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return;

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: "shortlist", version: "0.1.0" },
      });

    case "ping":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: [TOOL] });

    case "resources/list":
      return ok(id, {
        resources: [{ uri: RESOURCE_URI, name: "shortlist", mimeType: RESOURCE_MIME }],
      });

    case "resources/read": {
      if (params?.uri !== RESOURCE_URI) return fail(id, -32602, `unknown resource ${params?.uri}`);
      let html;
      try { html = fs.readFileSync(path.join(HERE, "app.html"), "utf8"); }
      catch { return fail(id, -32603, "app.html is missing; run node mcp/build-view.mjs"); }
      return ok(id, { contents: [{ uri: RESOURCE_URI, mimeType: RESOURCE_MIME, text: html }] });
    }

    case "tools/call": {
      if (params?.name !== TOOL.name) return fail(id, -32602, `unknown tool ${params?.name}`);
      const data = query(params.arguments || {});
      const summary = data.total
        ? `${data.total} plugin${data.total === 1 ? "" : "s"} matched, showing ${data.plugins.length}.`
        : "No plugins matched.";
      return ok(id, {
        content: [{ type: "text", text: JSON.stringify({ ...data, categories: categories(), summary }) }],
        structuredContent: {
          ...data,
          categories: categories(),
          marketplace: MARKETPLACE,
          marketplaceSource: MARKETPLACE_SOURCE,
          marketplaceReady: marketplaceReady(),
          installed: installed(),
        },
        _meta: { ui: { resourceUri: RESOURCE_URI } },
      });
    }

    default:
      return fail(id, -32601, `unknown method ${method}`);
  }
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    try { handle(msg); }
    catch (e) { if (msg?.id !== undefined) fail(msg.id, -32603, String(e && e.message)); }
  }
});
process.stdin.on("end", () => process.exit(0));
