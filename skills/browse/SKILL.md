---
description: Browse the Claude Code plugin catalogue by category. Use when the user wants to see what is available generally, asks what categories exist, or wants to explore rather than search for one specific thing.
disable-model-invocation: true
---

Show the user what is in the catalogue, starting from categories rather than a search.

Run `shortlist categories` first. If the user named a topic in "$ARGUMENTS", go straight
to `shortlist browse "<category>"` for the closest one instead.

Present it as a short list of categories with their sizes, then offer to open one. When
you open a category, use `--limit 10` so the reply stays readable, and mention how many
more there are.

Categories come from a fixed vocabulary, assigned by keyword rules over each plugin's
name and description. They are a browsing aid rather than the author's own labelling, so
a plugin can sit in more than one, and `Utility` is the fallback for anything the rules
did not recognise.
