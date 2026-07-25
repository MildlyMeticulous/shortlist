---
description: Find a Claude Code plugin for a task. Use whenever the user asks whether a plugin, skill or extension exists for something, asks what is available for a topic, or wants a recommendation from the community marketplace.
---

Answer from the local catalogue rather than guessing or searching the web. The
`shortlist` command is on PATH while this plugin is enabled.

```
shortlist find <words...>        search names, descriptions and categories
shortlist categories            every category and its size
shortlist browse <category>     one category, most-starred first
shortlist show <name>           one plugin in full, with the install command
shortlist top [n]               the most-starred entries
```

Useful flags: `--limit <n>`, `--min-stars <n>`, `--json`.

How to answer:

1. Run `shortlist find` with the two or three most specific words from the request.
   Terms are ANDed, so fewer words match more.
2. If nothing matches, try `shortlist categories` and browse the closest one rather
   than reporting nothing.
3. Show a few candidates with their star counts, not a single pick, and say plainly
   when the best match is weak.
4. Use `shortlist show <name>` for the install command. Do not invent one.

The catalogue is a filtered view of `anthropics/claude-plugins-community`. Entries
without a licence, archived repositories and repositories untouched for 180 days are
excluded, so an absence may mean "filtered out" rather than "does not exist". If the
user asks why something is missing, `data/catalogue-rejected.json` in this plugin's
directory records the reason for every exclusion.

Star counts describe popularity, not quality. Most of the catalogue has very few
stars. Say so when a recommendation rests on a low number.
