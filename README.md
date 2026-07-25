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
