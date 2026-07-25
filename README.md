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

Then ask Claude for a plugin in plain words, or run the command yourself:

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
`tags` and `keywords` all along. This assigns one from a fixed vocabulary of 21, by keyword
rules over each name and description, in `build/categories.mjs`.

```
  414  Productivity      163  Security          48  Data
  394  Agents            147  Integrations      42  Mobile
  388  Utility           130  Database          42  Cloud
  221  Backend           107  Git               40  Project management
  190  Testing           105  Code review       30  Language support
  179  Search             94  Documentation     19  Web3
  175  Infrastructure     54  Frontend
                          53  Design
```

The vocabulary is closed on purpose. Free-text tags are why the upstream list cannot be
browsed. `Utility` is the fallback where no rule matched, currently 23% of entries, which
is the obvious thing to improve next.

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
bin/shortlist                the command, on PATH while the plugin is enabled
skills/                      when Claude should reach for it
data/catalogue.json          the shipped snapshot
data/catalogue-rejected.json every exclusion and why
build/                       regenerates the snapshot
```

MIT.
