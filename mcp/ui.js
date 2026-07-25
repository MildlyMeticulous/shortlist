const { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } = globalThis.__ext;

const root = document.getElementById("root");
let state = { plugins: [], categories: [], total: 0, category: "", search: "" };
let busy = false;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stars = n => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));

function render() {
  const { plugins, categories, total, category, search } = state;

  const cats = categories.map(c =>
    `<button class="cat" data-cat="${esc(c.name)}" aria-pressed="${c.name === category}">
       <span>${esc(c.name)}</span><span>${c.count}</span>
     </button>`).join("");

  const items = plugins.map(p => `
    <div class="item">
      <div class="top">
        <span class="name">${esc(p.name)}</span>
        <span class="stars">${stars(p.stars)} ★</span>
      </div>
      <div class="desc">${esc(p.description.slice(0, 180))}${p.description.length > 180 ? "…" : ""}</div>
      <div class="meta">
        ${p.categories.map(c => `<span class="chip">${esc(c)}</span>`).join("")}
        <a href="https://github.com/${esc(p.repo)}" data-repo="${esc(p.repo)}">${esc(p.repo)}</a>
        <span class="chip">${esc(p.license)}</span>
        <button class="copy" data-install="${esc(p.name)}">copy install</button>
      </div>
    </div>`).join("");

  root.innerHTML = `
    <aside>
      <h2>Categories</h2>
      <button class="cat" data-cat="" aria-pressed="${!category}"><span>All</span><span>${state.allCount ?? ""}</span></button>
      ${cats}
    </aside>
    <main>
      <div class="bar">
        <input type="search" placeholder="Search plugins" value="${esc(search)}" ${busy ? "disabled" : ""}>
        <span class="count">${total} match${total === 1 ? "" : "es"}${plugins.length < total ? `, showing ${plugins.length}` : ""}</span>
      </div>
      ${plugins.length ? `<div class="grid">${items}</div>` : `<div class="empty">Nothing matched.</div>`}
      <div class="note">Filtered from the community marketplace. Entries without a licence, archived
      repositories and those untouched for 180 days are excluded. Stars are popularity, not quality;
      most of the catalogue has very few.</div>
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
  // Category counts overlap, so they cannot be summed for the total.
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

  const copy = e.target.closest("[data-install]");
  if (copy) {
    const cmd = `/plugin install ${copy.dataset.install}@claude-community`;
    navigator.clipboard?.writeText(cmd).then(
      () => { copy.textContent = "copied"; setTimeout(() => (copy.textContent = "copy install"), 1200); },
      () => app.sendMessage?.({ content: cmd })
    );
  }
});

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

// Draw before connecting. Awaiting the handshake first leaves a permanently blank
// panel on any host that never answers.
render();

app.connect().then(
  () => { theme(app.hostContext); render(); },
  err => {
    root.innerHTML = `<div class="empty">Could not reach the Claude host: ${esc(err?.message ?? err)}.<br>
      Run <code>shortlist</code> in the terminal instead.</div>`;
  }
);
