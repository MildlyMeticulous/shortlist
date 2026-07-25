# shortlist

Browse the Claude Code plugin catalogue from inside Claude Code.

The community marketplace lists **2,269 plugins**, alphabetically, each with a name, a
description and a source. No categories, no sizes, no way to tell a maintained plugin from
an abandoned one without opening every repository. This plugin puts a filtered, categorised
view of it behind a command.

```
/plugin marketplace add MildlyMeticulous/shortlist
/plugin install shortlist@shortlist
```

Ask Claude to show you plugins and it opens a browsable panel in the conversation:
a category sidebar with counts, a search box, and a card per plugin with its stars,
licence, repository and a copy-the-install-command button. That panel is an
[MCP App](https://modelcontextprotocol.io/extensions/apps/overview), rendered by the
host in a sandboxed iframe, so it works in the desktop app rather than only the terminal.

The same catalogue is available as a command:

```
shortlist find test coverage
shortlist categories
shortlist browse Testing --limit 10
shortlist show tailtest
shortlist top 20
```

## What it filters out

Of 2,269 upstream entries, 1,652 survive. The gates are mechanical and every rejection is
recorded with its reason in `data/catalogue-rejected.json`:

```
  560  no license
   28  repository unreachable
   17  archived
    8  untouched for 180 days
    4  no repository resolved
```

These are checkable facts, not judgements. A plugin is not excluded for being bad.

## Categories

Upstream entries carry no category, although `marketplace.json` has supported `category`,
`tags` and `keywords` all along. This assigns one from a fixed vocabulary of 25, by keyword
rules over each name and description, in `build/categories.mjs`.

```
  561  Agents                147  Integrations           53  Design
  414  Productivity          130  Database               48  Data
  275  Utility               122  Architecture           42  Mobile
  221  Backend               107  Git                    42  Cloud
  190  Testing               105  Code review            40  Project management
  179  Search                 95  Writing                30  Language support
  175  Infrastructure         94  Research               21  Web3
  163  Security               94  Documentation
  151  Business               54  Frontend
```

The vocabulary is closed on purpose. Free-text tags are why the upstream list cannot be
browsed. `Utility` is the fallback where no rule matched, currently 17% of entries.

## Does it actually load

The gates above are facts about a repository, not about the plugin inside it. A plugin can
have a licence, a recent commit and still not work. `build/validate.mjs` reads the tree at
the exact commit the marketplace pins and checks the things that make a plugin fail
silently:

```
shortlist broken              every entry that would not load, and why
shortlist show <name>         what a plugin provides, and any problems
shortlist find <words> --working    hide entries that fail the checks
```

Of 2,269 upstream entries, 2,061 load cleanly and 208 do not. The errors:

```
  125  no skills, commands, agents, hooks, servers or binaries
   54  no manifest anywhere in the repository
   37  repository or commit unreadable
   16  the marketplace path misses the plugin directory
    5  a hook bound to an event that does not exist
```

Warnings are separate and do not count as failures. The largest is 219 entries whose
marketplace `path` sits above the directory the plugin actually lives in, which is only a
warning because whether the host falls back to a `marketplace.json` beside it has not been
confirmed.

Six of these checks were wrong when first written, and every one of them flagged working
plugins:

```
  a hook-event list written from memory, 9 of the real 30, marked expo broken
  CRLF files parsed as empty, because "." does not match "\r" in JavaScript
  symlinked SKILL.md read as its own link target, since git stores the path as the blob
  git-subdir entries read as having no repository, they carry a bare owner/repo
  entries with a manifest deeper in the tree reported as having none at all
  a missing skill description treated as fatal
```

That last one was the worst, because the whole check was built on it. The docs say a
skill with no `description` falls back to the first paragraph of its markdown, so those
skills work and the check was measuring nothing. Verify against the docs and a live
repository before adding a code here, and prefer `warn` whenever the failure mode is a
guess.

Nothing here executes third-party code. It is one git tree read per entry and then raw
file reads, so it is safe to run over the whole catalogue. Starting the MCP servers to see
whether they answer `initialize` would catch more, and would mean running 2,269 strangers'
programs, so it is deliberately not done here.

## What this does not claim

Star counts are popularity, not quality. The median entry in the catalogue has **1 star**
and 69% have fewer than five, so a recommendation here usually rests on a small number and
the command says so.

Nothing here has been hand-reviewed yet. This is a filtered and sorted view of someone
else's catalogue, not a curated pick. Curation is the intended next step and it is
editorial work rather than a query.

The data is a snapshot. Rebuild it with `node build/build-catalogue.mjs <plugins.json>
<repocache.json>`.

## Layout

```
.claude-plugin/plugin.json   manifest
.mcp.json                    declares the MCP server
bin/shortlist                the command, on PATH while the plugin is enabled
skills/                      when Claude should reach for it
mcp/server.mjs               MCP server, no runtime dependencies
mcp/app.html                 the panel, generated and self-contained
mcp/ui.js  mcp/ui.css        panel source
mcp/build-view.mjs           vendors the ext-apps bundle into app.html
mcp/preview.mjs              renders the panel against a stub host, for development
data/catalogue.json          the shipped snapshot
data/catalogue-rejected.json every exclusion and why
data/validation.json         per-entry load checks, from build/validate.mjs
build/                       regenerates the snapshot
```

`app.html` is committed because the server reads it at runtime. Rebuild it with
`npm i @modelcontextprotocol/ext-apps && node mcp/build-view.mjs`. It inlines the client
bundle rather than fetching one, because the iframe is sandboxed and nothing external
loads.

The panel has been checked against a stub host with `node mcp/preview.mjs`, rendered in a
browser at desktop and narrow widths, on a dark surface, with search and category
filtering exercised. The body is transparent so the panel takes the host's background,
which means the palette has to be right before the host answers the handshake; that is
what the `prefers-color-scheme` block in `ui.css` is for. It has not yet been watched
rendering inside a real Claude host.

MIT.
