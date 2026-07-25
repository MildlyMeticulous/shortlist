const { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } = globalThis.__ext;

const root = document.getElementById("root");
let state = { plugins: [], categories: [], total: 0, category: "", search: "" };
let busy = false;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stars = n => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));

function render() {
  const { plugins, categories, total, category, search } = state;

  const cats = categories.map(c =>
    `<button class="cat" data-cat="${esc(c.name)}" aria-pressed="${c.name === category}"
             aria-label="${esc(c.name)}, ${c.count} plugins">
       <span>${esc(c.name)}</span><span>${c.count}</span>
     </button>`).join("");

  const items = plugins.map(p => `
    <article class="item">
      <div class="top">
        <h3 class="name">${esc(p.name)}</h3>
        ${p.fails ? `<span class="fails" title="${esc(p.fails)}">won't load</span>` : ""}
        <span class="stars" title="GitHub stars. Most of the catalogue has very few.">${stars(p.stars)} ★</span>
        <button class="copy" data-install="${esc(p.name)}">install</button>
      </div>
      <p class="desc">${esc(p.description.slice(0, 170))}${p.description.length > 170 ? "…" : ""}</p>
      <div class="meta">
        ${p.categories.slice(0, 3).map(c => `<span class="chip">${esc(c)}</span>`).join("")}
        <span class="chip">${esc(p.license)}</span>
        <a href="https://github.com/${esc(p.repo)}" data-repo="${esc(p.repo)}">${esc(p.repo)}</a>
      </div>
    </article>`).join("");

  root.innerHTML = `
    <aside>
      <h2>Categories</h2>
      <button class="cat all" data-cat="" aria-pressed="${!category}"
              aria-label="All categories, ${state.allCount ?? ""} plugins"><span>All</span><span>${state.allCount ?? ""}</span></button>
      ${cats}
    </aside>
    <main>
      <div class="bar">
        <input type="search" placeholder="Search ${state.allCount ?? ""} plugins" value="${esc(search)}" ${busy ? "disabled" : ""}>
        <span class="count">${total}${plugins.length < total ? ` · ${plugins.length} shown` : ""}</span>
      </div>
      ${plugins.length
        ? `<div class="grid">${items}</div>`
        : `<div class="empty"><strong>No matches</strong>Try fewer words, or pick a category.</div>`}
      <p class="note">Filtered from anthropics/claude-plugins-community.</p>
    </main>`;
}

async function requery(patch) {
  Object.assign(state, patch);
  busy = true;
  render();
  try {
    const res = await app.callServerTool({
      name: "browse_plugins",
      arguments: { search: state.search, category: state.category },
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
  if (!state.category && !state.search) state.allCount = state.total;
}

root.addEventListener("click", e => {
  const cat = e.target.closest("[data-cat]");
  if (cat) return void requery({ category: cat.dataset.cat });

  const link = e.target.closest("[data-repo]");
  if (link) {
    e.preventDefault();
    return void app.openLink({ url: `https://github.com/${link.dataset.repo}` }).catch(() => {});
  }

  const button = e.target.closest("[data-install]");
  if (button) return void install(button);
});

async function install(button) {
  const name = button.dataset.install;
  const marketplace = state.marketplace ?? "claude-community";
  const commands = [];
  if (!state.marketplaceReady)
    commands.push(`/plugin marketplace add ${state.marketplaceSource ?? "anthropics/claude-plugins-community"}`);
  commands.push(`/plugin install ${name}@${marketplace}`);

  const settle = (label, ms = 1600) => {
    button.textContent = label;
    setTimeout(() => { button.textContent = "install"; button.disabled = false; }, ms);
  };

  button.disabled = true;
  button.textContent = "sending";
  try {
    for (const text of commands) {
      const res = await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
      if (res?.isError) throw new Error("host rejected the message");
    }
    state.marketplaceReady = true;
    settle("sent");
  } catch {
    const cmd = commands.join("\n");
    try {
      await navigator.clipboard.writeText(cmd);
      settle("copied, paste it", 2600);
    } catch {
      button.replaceWith(Object.assign(document.createElement("code"), {
        className: "fallback",
        textContent: cmd,
      }));
    }
  }
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
