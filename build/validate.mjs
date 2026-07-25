import fs from "node:fs";
import path from "node:path";

const [marketplacePath, outArg] = process.argv.slice(2).filter(a => !a.startsWith("--"));
if (!marketplacePath) {
  console.error("usage: node build/validate.mjs <marketplace.json> [out] [--limit N] [--only a,b]");
  process.exit(1);
}
const flag = n => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const LIMIT = Number(flag("--limit")) || Infinity;
const ONLY = flag("--only")?.split(",").map(s => s.trim());
const OUT = outArg ?? "data/validation.json";
const CACHE = "data/.validate-cache.json";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const CONCURRENCY = 8;
const SYMLINK_MODE = "120000";
const BLOCK_SCALAR = new Set(["", ">", "|", ">-", "|-"]);
const ABSOLUTE_PATH = /(^|\s)([A-Za-z]:[\\/]|\/(home|Users)\/)/;
const SCRIPT_ARG = /\.(mjs|js|cjs|py|ts)\b/;

const HOOK_EVENTS = new Set([
  "SessionStart", "Setup", "UserPromptSubmit", "UserPromptExpansion", "PreToolUse",
  "PermissionRequest", "PermissionDenied", "PostToolUse", "PostToolUseFailure",
  "PostToolBatch", "Notification", "MessageDisplay", "SubagentStart", "SubagentStop",
  "TaskCreated", "TaskCompleted", "Stop", "StopFailure", "TeammateIdle",
  "InstructionsLoaded", "ConfigChange", "CwdChanged", "FileChanged", "WorktreeCreate",
  "WorktreeRemove", "PreCompact", "PostCompact", "Elicitation", "ElicitationResult",
  "SessionEnd",
]);

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

const api = async url => {
  const r = await fetch(url, {
    headers: {
      accept: "application/vnd.github+json",
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (r.status === 403 || r.status === 429) throw new Error("rate-limited");
  return r.ok ? r.json() : { _status: r.status };
};

const raw = async (repo, sha, file) => {
  const r = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${file}`);
  return r.ok ? r.text() : null;
};

function frontmatter(source) {
  const text = source?.replace(/\r\n?/g, "\n");
  if (!text?.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;

  const lines = text.slice(4, end).split("\n");
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    let value = m[2].trim();
    if (BLOCK_SCALAR.has(value)) {
      const continuation = [];
      while (i + 1 < lines.length && (lines[i + 1].trim() === "" || /^\s+\S/.test(lines[i + 1]))) {
        continuation.push(lines[++i].trim());
      }
      value = continuation.join(" ").trim();
    }
    out[m[1]] = value.replace(/^["']|["']$/g, "");
  }
  return out;
}

const parseRepo = url => {
  if (!url) return null;
  const fromUrl = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url);
  const fromBareOwnerRepo = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(url.trim());
  const m = fromUrl ?? fromBareOwnerRepo;
  return m ? `${m[1]}/${m[2]}` : null;
};

const declaredEvents = node =>
  Array.isArray(node) ? node.map(h => h?.event).filter(Boolean) : Object.keys(node);

async function validate(entry) {
  const src = typeof entry.source === "string" ? { url: entry.source } : (entry.source ?? {});
  const repo = parseRepo(src.url);
  const sha = src.sha ?? src.ref ?? "HEAD";
  const sub = (src.path ?? "").replace(/^\/+|\/+$/g, "");
  const result = { name: entry.name, repo, sha, path: sub || null, problems: [], capabilities: {} };
  const add = (level, code, detail) => result.problems.push({ level, code, ...(detail ? { detail } : {}) });

  if (!repo) { add("error", "no-repository"); return result; }

  const tree = await api(`https://api.github.com/repos/${repo}/git/trees/${sha}?recursive=1`);
  if (tree._status) { add("error", "tree-unreadable", `HTTP ${tree._status}`); return result; }
  if (tree.truncated) add("warn", "tree-truncated", "repository too large to list fully");

  const prefix = sub ? sub + "/" : "";
  const blobs = tree.tree.filter(t => t.type === "blob" && t.path.startsWith(prefix));
  const files = blobs.map(t => t.path.slice(prefix.length));
  const modes = new Map(blobs.map(t => [t.path.slice(prefix.length), t.mode]));
  const has = f => files.includes(f);
  const under = d => files.filter(f => f.startsWith(d + "/"));

  const readFile = async file => {
    const contents = await raw(repo, sha, prefix + file);
    if (contents === null || modes.get(file) !== SYMLINK_MODE) return contents;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), contents.trim()));
    return raw(repo, sha, prefix + target);
  };

  if (sub && files.length === 0) { add("error", "subdirectory-missing", sub); return result; }

  const manifestPath = ".claude-plugin/plugin.json";
  const manifestsBelow = files
    .filter(f => f.endsWith(".claude-plugin/plugin.json") && f !== manifestPath)
    .map(f => f.replace(/\/?\.claude-plugin\/plugin\.json$/, ""));

  if (!has(manifestPath)) {
    if (manifestsBelow.length)
      add("warn", "entry-points-above-the-plugin",
        `nothing at ${sub || "the repository root"}, a manifest sits at ${manifestsBelow.slice(0, 3).join(", ")}`);
    else
      add("error", "no-manifest", manifestPath);
  } else {
    let manifest;
    try { manifest = JSON.parse(await readFile(manifestPath)); }
    catch { add("error", "manifest-unparseable", manifestPath); }
    if (manifest && !manifest.name) add("error", "manifest-no-name");
    else if (manifest && manifest.name !== entry.name)
      add("warn", "manifest-name-mismatch", `manifest "${manifest.name}" vs marketplace "${entry.name}"`);
  }

  const skillFiles = files.filter(f => /^skills\/.+\/SKILL\.md$/.test(f));
  result.capabilities.skills = skillFiles.length;
  for (const f of skillFiles.slice(0, 12)) {
    const text = await readFile(f);
    if (text === null) { add("warn", "skill-unreadable", f); continue; }
    const fm = frontmatter(text);
    if (!fm) add("warn", "skill-no-frontmatter", `${f}, trigger falls back to the first paragraph`);
    else if (!fm.description) add("warn", "skill-no-description", `${f}, trigger falls back to the first paragraph`);
    else if (fm.description.length < 20) add("warn", "skill-description-thin", `${f} (${fm.description.length} chars)`);
  }
  if (under("skills").length && !skillFiles.length)
    add("warn", "skills-dir-without-skill-md", "skills/ exists but holds no SKILL.md");

  if (has("hooks/hooks.json")) {
    result.capabilities.hooks = true;
    let hooks;
    try { hooks = JSON.parse(await raw(repo, sha, prefix + "hooks/hooks.json")); }
    catch { add("error", "hooks-unparseable", "hooks/hooks.json"); }
    if (hooks) {
      const events = declaredEvents(hooks.hooks ?? hooks);
      if (!events.length) add("warn", "hooks-no-events", "hooks/hooks.json");
      for (const ev of events) if (!HOOK_EVENTS.has(ev)) add("error", "hook-unknown-event", ev);
    }
  }

  if (has(".mcp.json")) {
    result.capabilities.mcp = true;
    let mcp;
    try { mcp = JSON.parse(await raw(repo, sha, prefix + ".mcp.json")); }
    catch { add("error", "mcp-unparseable", ".mcp.json"); }
    if (mcp) {
      const servers = mcp.mcpServers ?? {};
      if (!Object.keys(servers).length) add("warn", "mcp-no-servers", ".mcp.json declares none");
      for (const [name, s] of Object.entries(servers)) {
        const argv = [s.command, ...(s.args ?? [])].filter(Boolean).join(" ");
        const anchored = argv.includes("${CLAUDE_PLUGIN_ROOT}");
        if (ABSOLUTE_PATH.test(argv))
          add("error", "mcp-absolute-path", `${name}: ${argv.slice(0, 80)}`);
        else if (s.args?.some(a => a.includes("../")) || (!anchored && SCRIPT_ARG.test(argv)))
          add("warn", "mcp-unanchored-path", `${name}: ${argv.slice(0, 80)}`);
      }
    }
  }

  result.capabilities.commands = under("commands").filter(f => f.endsWith(".md")).length;
  result.capabilities.agents = under("agents").filter(f => f.endsWith(".md")).length;
  result.capabilities.bin = under("bin").length;

  const c = result.capabilities;
  if (!c.skills && !c.commands && !c.agents && !c.hooks && !c.mcp && !c.bin) {
    if (manifestsBelow.length)
      add("warn", "entry-points-above-the-plugin",
        `nothing at ${sub || "the repository root"}, a manifest sits at ${manifestsBelow.slice(0, 3).join(", ")}`);
    else
      add("error", "no-capabilities", "no skills, commands, agents, hooks, mcp servers or binaries");
  }

  return result;
}

const entries = JSON.parse(fs.readFileSync(marketplacePath, "utf8")).plugins
  .filter(p => !ONLY || ONLY.includes(p.name))
  .slice(0, LIMIT);

const results = [];
let done = 0, fromCache = 0;

async function worker(queue) {
  while (queue.length) {
    const entry = queue.shift();
    const key = `${entry.name}@${(typeof entry.source === "object" ? entry.source.sha : "") ?? ""}`;
    if (cache[key]) { results.push(cache[key]); fromCache++; done++; continue; }
    try {
      cache[key] = await validate(entry);
      results.push(cache[key]);
    } catch (e) {
      if (e.message === "rate-limited") { queue.length = 0; console.error("\nrate limited, stopping early"); break; }
      results.push({ name: entry.name, problems: [{ level: "error", code: "check-failed", detail: e.message }] });
    }
    done++;
    if (done % 25 === 0) {
      process.stderr.write(`\r${done}/${entries.length}  cached ${fromCache}`);
      fs.writeFileSync(CACHE, JSON.stringify(cache));
    }
  }
}

const queue = [...entries];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
fs.writeFileSync(CACHE, JSON.stringify(cache));
process.stderr.write(`\r${done}/${entries.length} checked\n`);

for (const r of results) r.ok = !r.problems.some(p => p.level === "error");

const codes = {};
for (const r of results) for (const p of r.problems) codes[p.code] = (codes[p.code] ?? 0) + 1;

const payload = {
  built: new Date().toISOString().slice(0, 10),
  checked: results.length,
  ok: results.filter(r => r.ok).length,
  codes,
  results: results.sort((a, b) => a.name.localeCompare(b.name)),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(payload, null, 1));

console.log(`\nchecked ${payload.checked}, load cleanly ${payload.ok} (${(payload.ok / payload.checked * 100).toFixed(1)}%)`);
console.log(Object.entries(codes).sort((a, b) => b[1] - a[1])
  .map(([c, n]) => `${String(n).padStart(6)}  ${c}`).join("\n"));
