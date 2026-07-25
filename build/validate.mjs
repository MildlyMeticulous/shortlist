// Checks that each catalogue entry would actually load, the way Vencord's reporter
// checks that every patch still applies. Everything here is static: one git tree read
// per plugin, then raw file reads. No third-party code is executed.
//
//   node build/validate.mjs <marketplace.json> [out] [--limit N] [--only name,name]
//
// Needs a GitHub token in GITHUB_TOKEN or GH_TOKEN for the tree reads (5000/hour).
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

// From code.claude.com/docs/en/hooks. Keep this in step with the docs: a short list
// here reports working plugins as broken, which is worse than missing a typo.
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
  if (!r.ok) return { _status: r.status };
  return r.json();
};
const raw = async (repo, sha, file) => {
  const r = await fetch(`https://raw.githubusercontent.com/${repo}/${sha}/${file}`);
  return r.ok ? r.text() : null;
};

// Descriptions are routinely written as folded or literal block scalars, so reading
// only the text on the key's own line reports them as one character long.
function frontmatter(src) {
  // CRLF has to go first: "." does not match "\r", so (.*)$ fails on every line and
  // the whole block parses as empty.
  const text = src?.replace(/\r\n?/g, "\n");
  if (!text?.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;
  const lines = text.slice(4, end).split("\n");
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    let value = m[2].trim();
    if (value === "" || value === ">" || value === "|" || value === ">-" || value === "|-") {
      const block = [];
      while (i + 1 < lines.length && (lines[i + 1].trim() === "" || /^\s+\S/.test(lines[i + 1]))) {
        block.push(lines[++i].trim());
      }
      value = block.join(" ").trim();
    }
    out[m[1]] = value.replace(/^["']|["']$/g, "");
  }
  return out;
}

// Entries with source "git-subdir" carry a bare owner/repo rather than a full URL.
const parseRepo = url => {
  if (!url) return null;
  const full = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/.exec(url);
  if (full) return `${full[1]}/${full[2]}`;
  const bare = /^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(url.trim());
  return bare ? `${bare[1]}/${bare[2]}` : null;
};

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

  // Git stores a symlink as a blob holding its target, so reading one raw returns the
  // path rather than the file. Several repos symlink SKILL.md at the repository root.
  const read = async file => {
    const text = await raw(repo, sha, prefix + file);
    if (text === null || modes.get(file) !== "120000") return text;
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), text.trim()));
    return raw(repo, sha, prefix + target);
  };
  const has = f => files.includes(f);
  const under = d => files.filter(f => f.startsWith(d + "/"));

  if (sub && files.length === 0) { add("error", "subdirectory-missing", sub); return result; }

  // Manifest.
  const manifestPath = ".claude-plugin/plugin.json";
  if (!has(manifestPath)) {
    add("error", "no-manifest", manifestPath);
  } else {
    const text = await read(manifestPath);
    let manifest;
    try { manifest = JSON.parse(text); } catch { add("error", "manifest-unparseable", manifestPath); }
    if (manifest) {
      if (!manifest.name) add("error", "manifest-no-name");
      else if (manifest.name !== entry.name)
        add("warn", "manifest-name-mismatch", `manifest "${manifest.name}" vs marketplace "${entry.name}"`);
    }
  }

  // Skills. A skill with no description is never auto-invoked, so it installs and
  // then does nothing, which is the failure a user cannot see.
  const skillFiles = files.filter(f => /^skills\/.+\/SKILL\.md$/.test(f));
  result.capabilities.skills = skillFiles.length;
  for (const f of skillFiles.slice(0, 12)) {
    const text = await read(f);
    if (text === null) { add("warn", "skill-unreadable", f); continue; }
    const fm = frontmatter(text);
    if (!fm) add("error", "skill-no-frontmatter", f);
    else if (!fm.description) add("error", "skill-no-description", f);
    else if (fm.description.length < 20) add("warn", "skill-description-thin", `${f} (${fm.description.length} chars)`);
  }
  if (under("skills").length && !skillFiles.length)
    add("warn", "skills-dir-without-skill-md", "skills/ exists but holds no SKILL.md");

  // Hooks.
  if (has("hooks/hooks.json")) {
    result.capabilities.hooks = true;
    const text = await raw(repo, sha, prefix + "hooks/hooks.json");
    let hooks;
    try { hooks = JSON.parse(text); } catch { add("error", "hooks-unparseable", "hooks/hooks.json"); }
    if (hooks) {
      // Two shapes are in use: events as keys, and a list of entries carrying an
      // "event" property. Reading keys off the list form yields array indices.
      const node = hooks.hooks ?? hooks;
      const declared = Array.isArray(node)
        ? node.map(h => h?.event).filter(Boolean)
        : Object.keys(node);
      if (Array.isArray(node) && !declared.length) add("warn", "hooks-no-events", "hooks/hooks.json");
      for (const ev of declared)
        if (!HOOK_EVENTS.has(ev)) add("error", "hook-unknown-event", ev);
    }
  }

  // MCP servers.
  if (has(".mcp.json")) {
    result.capabilities.mcp = true;
    const text = await raw(repo, sha, prefix + ".mcp.json");
    let mcp;
    try { mcp = JSON.parse(text); } catch { add("error", "mcp-unparseable", ".mcp.json"); }
    if (mcp) {
      const servers = mcp.mcpServers ?? {};
      if (!Object.keys(servers).length) add("warn", "mcp-no-servers", ".mcp.json declares none");
      for (const [name, s] of Object.entries(servers)) {
        const argv = [s.command, ...(s.args ?? [])].filter(Boolean).join(" ");
        // An absolute path is the author's own machine and will not resolve anywhere else.
        if (/(^|\s)([A-Za-z]:[\\/]|\/(home|Users)\/)/.test(argv))
          add("error", "mcp-absolute-path", `${name}: ${argv.slice(0, 80)}`);
        else if (s.args?.some(a => /\.\.\//.test(a)) || (!argv.includes("${CLAUDE_PLUGIN_ROOT}") && /\.(mjs|js|cjs|py|ts)\b/.test(argv)))
          add("warn", "mcp-unanchored-path", `${name}: ${argv.slice(0, 80)}`);
      }
    }
  }

  result.capabilities.commands = under("commands").filter(f => f.endsWith(".md")).length;
  result.capabilities.agents = under("agents").filter(f => f.endsWith(".md")).length;
  result.capabilities.bin = under("bin").length;

  const c = result.capabilities;
  if (!c.skills && !c.commands && !c.agents && !c.hooks && !c.mcp && !c.bin) {
    // A manifest deeper in the tree means the entry points at the wrong level rather
    // than at an empty plugin, which is a different thing for the author to fix.
    const deeper = files.filter(f => f.endsWith(".claude-plugin/plugin.json") && f !== manifestPath)
      .map(f => f.replace(/\/?\.claude-plugin\/plugin\.json$/, ""));
    // A warning, not an error: the pinned path holds no capabilities, but whether the
    // host falls back to a marketplace.json beside it is unconfirmed.
    if (deeper.length)
      add("warn", "entry-points-above-the-plugin", `nothing at ${sub || "the repository root"}, a manifest sits at ${deeper.slice(0, 3).join(", ")}`);
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
const CONCURRENCY = 8;

async function worker(queue) {
  while (queue.length) {
    const entry = queue.shift();
    const key = `${entry.name}@${(typeof entry.source === "object" ? entry.source.sha : "") ?? ""}`;
    if (cache[key]) { results.push(cache[key]); fromCache++; done++; continue; }
    try {
      const r = await validate(entry);
      cache[key] = r;
      results.push(r);
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
