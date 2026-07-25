# shortlist

A curated Claude Code plugin marketplace, plus the tooling that makes curating one
tractable.

```
/plugin marketplace add MildlyMeticulous/shortlist
/plugin install <name>@shortlist
```

## The problem, measured

`anthropics/claude-plugins-community` lists **2,269 plugins** across 2,004 distinct
repositories. Every entry is SHA-pinned and review-gated. Each one carries a `name`, a
`description`, a `source` and a `homepage`, and nothing else. The list is alphabetical.

Metadata from those repositories:

```
median stars       1
0 stars           36%
under 5 stars     69%
100 or more        7%
no license        24%
```

That is the same distribution as the 5,906 loosely tagged `claude-skills` repos on GitHub,
which were sampled separately: 37% at zero stars, 74% under five. The review gate is
screening for safety, not for whether anyone should install the thing.

Naming shows the duplication. Across the catalogue, `claude` appears in 179 plugin names,
`skills` in 88, `plugin` in 63, `mcp` in 63, `agent` in 54. In the wider GitHub set, 30
separate repositories are named exactly `skills`.

## Two things that were tried and did not work

**Ranking by generated-text density.** The obvious idea was to score each plugin with
`ai-tells` and rank by how machine-written it reads. Scanning 54 repositories across the
star range gives median densities of 11.99 for 0-2 stars, 18.26 for 3-49, and 16.14 for
50+. There is no correlation, and only 5-6% of repositories score clean in any band.
Nearly the whole ecosystem is machine-written, including everything people use. Filtering
on it would delete the catalogue.

**Mechanical quality gates.** Of 1,506 enriched repositories, 99% are neither archived nor
stale, because everything in the catalogue was submitted recently. Requiring a license
cuts to 75%. Requiring ten stars cuts to 19%, and stars measure popularity rather than
usefulness.

So automation reduces 2,269 to roughly 290. It cannot get from 290 to a shortlist.

## What Vencord actually does

Vencord ships 168 plugins and feels clean. Reading its source and contributing guide, the
cleanliness comes from refusal, not from tooling:

> Consider if this plugin would be useful to a large portion of the userbase. We do not
> accept niche plugins

followed by an explicit blocklist: no trivial slash commands, no text-replace plugins, no
raw DOM manipulation, no plugins that merely hide UI, no bot-specific plugins, no
selfbots, no untrusted third-party APIs, no plugins requiring the user's own API key.

The mechanisms worth copying are smaller and concrete. `PluginDef` requires `name`,
`description` and `authors`. Its `tags` come from a closed vocabulary of 21 categories
rather than free text. A `searchTerms` field lets a plugin be found under names it is not
called. Settings are declarative, so one generic UI renders all of them. `start()` and
`stop()` allow toggling without a restart, and `requiresRestart` is an honesty flag for
when that is impossible.

## The opening

`marketplace.json` already supports `category`, `tags`, `keywords`, `strict` and
`relevance` on every entry, and lets entries carry any plugin-manifest field. The official
community catalogue populates none of them.

So the format supports a browsable, categorised catalogue today. Nobody has built one.

## Shape

Four parts, in dependency order.

**1. Intake.** A pipeline that pulls the upstream catalogue and, for each entry, records
repository metadata, runs `claude plugin validate`, and inspects the tree to record what
the plugin actually ships: how many skills, agents, hooks, MCP servers, LSP servers,
monitors, and whether it ships anything at all beyond a README. Output is one row per
plugin.

**2. Clustering.** Group by declared function so that near-duplicates land together and
one representative can be chosen per cluster. This is where the bulk of the reduction
comes from, given how concentrated the naming is.

**3. Editorial pass.** Read the shortlist and decide, against a published policy. This is
judgement and cannot be automated away. It is also the entire product.

**4. Surfaces.** A `marketplace.json` carrying the survivors with `category` and `tags`
populated, and a static browse page generated from the same rows. The browse page is the
thing people share; the marketplace is the thing they install from.

## Rejection policy, first draft

Hard, checkable:

- Fails `claude plugin validate`
- Ships no component: no skill, agent, hook, MCP server, LSP server or monitor
- No license
- Archived
- Requires the user to supply their own API key
- Points at a self-hosted or unidentifiable third-party endpoint

Judgement:

- The whole plugin is one prompt that could be a two-line note in `CLAUDE.md`
- A grab-bag repository of unrelated skills, rather than a plugin with a purpose
- A duplicate of something already listed, without being better at it
- Describes capability it does not implement

Every rejection gets a one-line reason, published. The reasons are the product's evidence
that a bar exists.

## Open questions

**Who does the editorial pass.** Vencord's bar is enforced by humans who say no a lot. If
that work is done by an agent, the list is only as good as the reading behind each call,
and the honest move is to say so on the page rather than imply a human curator.

**The awkward part.** Vencord's contributing guide bans majority-AI contributions outright
and threatens a permanent block. Nothing here contributes to Vencord, and the analysis
that produced twelve upstream bug fixes is reading rather than generation. But a page that
sells itself on being curated, unlike all the machine-written sprawl, should not be coy
about who assembled it.

**Whether 2,269 upstream entries is the right universe.** It is review-gated and
SHA-pinned, which makes it safer and easier to work with than the 5,906-repo GitHub
sprawl. It also inherits upstream's decisions. Starting there and widening later is the
cheaper order.

## Build order

1. Intake and enrichment across all 2,269. Partially done: 1,525 repositories enriched.
2. Component inspection and `claude plugin validate` over the survivors.
3. Clustering, then the editorial pass.
4. `marketplace.json` and the browse page.

Step 2 is the one that has not been proven yet, and it decides whether any of this works,
because "ships a real component" is the only automated signal left that speaks to quality
rather than popularity.
