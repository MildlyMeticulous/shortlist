const { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } = globalThis.__ext;

const root = document.getElementById("root");
let state = { plugins: [], categories: [], total: 0, category: "", search: "" };
let busy = false;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stars = n => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));

const NEW_FOR_DAYS = 7;
const marketplace = () => state.marketplace ?? "claude-community";
const installedHere = () => new Map((state.installed ?? [])
  .filter(p => p.marketplace === marketplace())
  .map(p => [p.name, p]));
const isNew = at => at && Date.now() - Date.parse(at) < NEW_FOR_DAYS * 864e5;
const when = at => {
  if (!at) return "";
  const days = Math.floor((Date.now() - Date.parse(at)) / 864e5);
  return days < 1 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
};

function switchFor(id, on, name) {
  const failed = (state.failed ?? {})[id];
  const pending = (state.pending ?? {})[id];
  const marker = failed
    ? `<code class="fallback" title="the host would not run it, paste this instead">${esc(failed)}</code>`
    : pending ? `<span class="badge pending">restart to apply</span>` : "";
  return `${marker}<button class="switch" role="switch" data-toggle="${esc(id)}"
    aria-checked="${on}" aria-label="${on ? "Turn off" : "Turn on"} ${esc(name)}"></button>`;
}

function renderInstalled() {
  const rows = state.installed ?? [];
  const active = state.installedFilter ?? "all";
  const shown = active === "enabled" ? rows.filter(p => p.enabled)
    : active === "disabled" ? rows.filter(p => !p.enabled)
    : active === "new" ? rows.filter(p => isNew(p.installedAt))
    : rows;

  if (!rows.length) {
    return `<div class="empty"><strong>Nothing installed</strong>Anything you install from Browse shows up here.</div>`;
  }
  const items = shown.map(p => `
    <article class="item">
      <div class="top">
        <h3 class="name">${esc(p.name)}</h3>
        ${isNew(p.installedAt) ? `<span class="badge new">new</span>` : ""}
        ${switchFor(p.id, p.enabled, p.name)}
      </div>
      <div class="meta">
        <span class="chip">${esc(p.marketplace)}</span>
        ${p.version ? `<span class="chip">v${esc(p.version)}</span>` : ""}
        ${p.scope ? `<span class="chip">${esc(p.scope)}</span>` : ""}
        <span class="stars">${esc(when(p.installedAt))}</span>
      </div>
    </article>`).join("");

  const counts = {
    all: rows.length,
    enabled: rows.filter(p => p.enabled).length,
    new: rows.filter(p => isNew(p.installedAt)).length,
  };
  counts.disabled = counts.all - counts.enabled;
  const filters = ["all", "enabled", "disabled", "new"].map(f =>
    `<button class="filter" data-filter="${f}" aria-pressed="${active === f}">${f}<span>${counts[f]}</span></button>`).join("");

  return `<div class="filters">${filters}</div>
    ${shown.length ? `<div class="grid">${items}</div>` : `<div class="empty"><strong>None ${esc(active)}</strong></div>`}
    <p class="note">Read from ~/.claude/plugins. Enable and disable with /plugin.</p>`;
}

const FILTERS = ["all", "new", "installed", "enabled", "disabled"];

function renderFilters() {
  const counts = state.counts ?? {};
  const active = state.filter ?? "all";
  return FILTERS
    .filter(f => f === "all" || f === active || counts[f])
    .map(f => `<button class="filter" data-filter="${f}" aria-pressed="${active === f}">${f}<span>${counts[f] ?? 0}</span></button>`)
    .join("");
}

function render() {
  const { plugins, categories, total, category, search } = state;
  const have = installedHere();

  const cats = categories.map(c =>
    `<button class="cat" data-cat="${esc(c.name)}" aria-pressed="${c.name === category}"
             aria-label="${esc(c.name)}, ${c.count} plugins">
       <span>${esc(c.name)}</span><span>${c.count}</span>
     </button>`).join("");

  const items = plugins.map(p => `
    <article class="item">
      <div class="top">
        <h3 class="name">${esc(p.name)}</h3>
        ${p.new ? `<span class="badge new">new</span>` : ""}
        ${p.fails ? `<span class="fails" title="${esc(p.fails)}">won't load</span>` : ""}
        <span class="stars" title="GitHub stars. Most of the catalogue has very few.">${stars(p.stars)} ★</span>
        ${switchFor(`${p.name}@${marketplace()}`, have.get(p.name)?.enabled === true, p.name)}
      </div>
      <p class="desc">${esc(p.description.slice(0, 170))}${p.description.length > 170 ? "…" : ""}</p>
      <div class="meta">
        ${p.categories.slice(0, 3).map(c => `<span class="chip">${esc(c)}</span>`).join("")}
        <span class="chip">${esc(p.license)}</span>
        ${have.has(p.name) ? `<span class="chip">installed</span>` : ""}
        <a href="https://github.com/${esc(p.repo)}" data-repo="${esc(p.repo)}">${esc(p.repo)}</a>
      </div>
    </article>`).join("");

  const browsing = state.view !== "installed";

  root.innerHTML = `
    <aside>
      <nav>
        <button class="nav" data-view="browse" aria-pressed="${browsing}"><span>Browse</span></button>
        <button class="nav" data-view="installed" aria-pressed="${!browsing}"><span>Installed</span><span>${(state.installed ?? []).length || ""}</span></button>
      </nav>
      <h2>Categories</h2>
      <button class="cat all" data-cat="" aria-pressed="${!category}"
              aria-label="All categories, ${state.allCount ?? ""} plugins"><span>All</span><span>${state.allCount ?? ""}</span></button>
      ${cats}
    </aside>
    <main>
      ${browsing ? `
      <div class="bar">
        <input type="search" placeholder="Search ${state.allCount ?? ""} skills and plugins" value="${esc(search)}" ${busy ? "disabled" : ""}>
        <span class="count">${total} result${total === 1 ? "" : "s"}</span>
      </div>
      <div class="filters">${renderFilters()}</div>
      ${plugins.length
        ? `<div class="grid">${items}</div>${plugins.length < total ? `<p class="note">Showing the top ${plugins.length}. Narrow it with a search or a category.</p>` : `<p class="note">Filtered from anthropics/claude-plugins-community.</p>`}`
        : `<div class="empty"><strong>No matches</strong>Try fewer words, or pick a category.</div>`}`
      : renderInstalled()}
    </main>`;
}

async function requery(patch) {
  Object.assign(state, patch);
  busy = true;
  render();
  try {
    const res = await app.callServerTool({
      name: "browse_plugins",
      arguments: { search: state.search, category: state.category, filter: state.filter ?? "all" },
    });
    absorb(res);
  } catch (e) {
    root.querySelector(".count")?.replaceChildren(document.createTextNode("search failed"));
  } finally {
    busy = false;
    render();
  }
}

function absorb(result) {
  const text = result?.content?.find(c => c.type === "text")?.text;
  const data = result?.structuredContent ?? (text ? JSON.parse(text) : null);
  if (!data) return;
  state.plugins = data.plugins ?? [];
  state.total = data.total ?? state.plugins.length;
  if (data.categories) state.categories = data.categories;
  if (data.marketplace) state.marketplace = data.marketplace;
  if (data.marketplaceSource) state.marketplaceSource = data.marketplaceSource;
  if (data.marketplaceReady !== undefined) state.marketplaceReady = data.marketplaceReady;
  if (data.installed) state.installed = data.installed;
  if (data.counts) state.counts = data.counts;
  if (!state.category && !state.search && (state.filter ?? "all") === "all") state.allCount = state.total;
}

root.addEventListener("click", e => {
  const tab = e.target.closest("[data-view]");
  if (tab) { state.view = tab.dataset.view; return void render(); }

  const filter = e.target.closest("[data-filter]");
  if (filter) {
    if (state.view === "installed") { state.installedFilter = filter.dataset.filter; return void render(); }
    return void requery({ filter: filter.dataset.filter });
  }

  const cat = e.target.closest("[data-cat]");
  if (cat) { state.view = "browse"; return void requery({ category: cat.dataset.cat }); }

  const link = e.target.closest("[data-repo]");
  if (link) {
    e.preventDefault();
    return void app.openLink({ url: `https://github.com/${link.dataset.repo}` }).catch(() => {});
  }

  const toggle = e.target.closest("[data-toggle]");
  if (toggle) return void setEnabled(toggle);

});

async function setEnabled(toggle) {
  const id = toggle.dataset.toggle;
  const row = (state.installed ?? []).find(p => p.id === id);
  const wanted = !(row?.enabled === true);

  const commands = [];
  if (!row) {
    if (!state.marketplaceReady)
      commands.push(`/plugin marketplace add ${state.marketplaceSource ?? "anthropics/claude-plugins-community"}`);
    commands.push(`/plugin install ${id}`);
  } else {
    commands.push(`/plugin ${wanted ? "enable" : "disable"} ${id}`);
  }

  const failed = { ...(state.failed ?? {}) };
  delete failed[id];
  toggle.disabled = true;
  try {
    for (const text of commands) {
      const res = await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
      if (res?.isError) throw new Error("host rejected the message");
    }
    if (row) row.enabled = wanted;
    else {
      const [name] = id.split("@");
      state.installed = [...(state.installed ?? []), { id, name, marketplace: marketplace(), enabled: true, installedAt: new Date().toISOString() }];
      state.marketplaceReady = true;
    }
    state.pending = { ...(state.pending ?? {}), [id]: true };
  } catch {
    failed[id] = commands.join("\n");
  }
  state.failed = failed;
  render();
}


let typing;
root.addEventListener("input", e => {
  if (e.target.type !== "search") return;
  clearTimeout(typing);
  const value = e.target.value;
  typing = setTimeout(() => requery({ search: value }), 250);
});

const app = new App({ name: "shortlist", version: "0.1.0" });
app.ontoolresult = result => { absorb(result); render(); };
app.onhostcontextchanged = ctx => { applyDocumentTheme?.(ctx); applyHostStyleVariables?.(ctx); applyHostFonts?.(ctx); };

const theme = ctx => { applyDocumentTheme?.(ctx); applyHostStyleVariables?.(ctx); applyHostFonts?.(ctx); };

render();

app.connect().then(
  () => { theme(app.hostContext); render(); },
  err => {
    root.innerHTML = `<div class="empty">Could not reach the Claude host: ${esc(err?.message ?? err)}.<br>
      Run <code>shortlist</code> in the terminal instead.</div>`;
  }
);
