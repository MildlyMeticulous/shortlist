// A closed vocabulary, the way Vencord's PluginTags is closed. Free-text tags are
// why the upstream catalogue cannot be browsed.
export const CATEGORIES = [
  "Testing", "Code review", "Security", "Documentation", "Git", "Database",
  "Frontend", "Backend", "Infrastructure", "Cloud", "Data", "Agents",
  "Language support", "Productivity", "Project management", "Search",
  "Design", "Mobile", "Web3", "Integrations", "Utility",
];

// Ordered: the first rule that matches wins, so put the specific ones first.
const RULES = [
  // "wallet" on its own hits database auth docs, so it needs crypto context.
  ["Web3", /\b(web3|solidity|ethereum|erc-?(20|721)|blockchain|smart contract|defi|nft|solana|aptos|dapp|evm|metamask|on-?chain|crypto ?wallet)\b/i],
  ["Security", /\b(security|vulnerab|pentest|owasp|cve|secret scan|sast|dast|threat model|audit(ing)? code|compliance)\b/i],
  ["Testing", /\b(test(s|ing)?|tdd|bdd|jest|pytest|vitest|playwright|cypress|coverage|e2e|unit test)\b/i],
  ["Code review", /\b(code review|reviewer|pull request review|pr review|lint(er|ing)?|refactor|code quality|static analysis)\b/i],
  ["Language support", /\b(lsp|language server|type ?check|intellisense|autocomplete|syntax)\b/i],
  ["Database", /\b(database|sql|postgres|mysql|sqlite|mongo|redis|prisma|orm|migration|schema)\b/i],
  ["Cloud", /\b(aws|azure|gcp|google cloud|cloudflare|s3|lambda|serverless)\b/i],
  ["Infrastructure", /\b(docker|kubernetes|k8s|terraform|ansible|ci\/cd|deploy(ment)?|devops|helm|pipeline)\b/i],
  ["Git", /\b(git|commit|branch|worktree|merge|rebase|changelog|conventional commit)\b/i],
  ["Frontend", /\b(react|vue|svelte|angular|next\.?js|tailwind|css|frontend|ui component|storybook)\b/i],
  ["Mobile", /\b(ios|android|swift|kotlin|react native|flutter|expo|mobile app)\b/i],
  ["Backend", /\b(api|rest|graphql|grpc|backend|microservice|endpoint|fastapi|django|rails|express)\b/i],
  ["Data", /\b(data (science|analysis|pipeline)|pandas|notebook|jupyter|etl|analytics|dataset|csv|spreadsheet)\b/i],
  ["Documentation", /\b(document(ation|ing)?|readme|docstring|api docs|changelog|adr|technical writ)\b/i],
  ["Design", /\b(design system|figma|ux|accessibility|a11y|wcag|typography|colou?r palette|brand)\b/i],
  ["Project management", /\b(jira|linear|asana|trello|sprint|backlog|ticket|issue track|roadmap|standup)\b/i],
  ["Search", /\b(search|index(ing)?|rag|retrieval|embedding|vector|semantic search)\b/i],
  ["Agents", /\b(agent|subagent|orchestrat|multi-?agent|swarm|delegate|workflow engine|skill(s)? for)\b/i],
  ["Integrations", /\b(slack|discord|notion|github app|gitlab|shopify|stripe|salesforce|hubspot|zapier|mcp server)\b/i],
  ["Productivity", /\b(productiv|memory|context|note(s|taking)?|todo|reminder|session|handoff|checkpoint)\b/i],
];

export function classify(text) {
  for (const [name, re] of RULES) if (re.test(text)) return name;
  return "Utility";
}

export function classifyAll(text) {
  const out = RULES.filter(([, re]) => re.test(text)).map(([n]) => n);
  return out.length ? out : ["Utility"];
}
