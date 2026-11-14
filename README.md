# a2a-skills
This repo contains skills and tools that can be used for evaluating the quality of A2A agent cards, agent-card/query visualizer, query builder etc. 


## Agent Card Evaluator Skill:

provides a score on a 10-point rubric ( sample example - Wednesday.com, a task management tool like Jira, Asana, etc) 

| # | Dimension | Weight | Score (0-4) | Weighted | Key evidence (quoted) | Top fix |
|---|-----------|-------:|:-----------:|---------:|-----------------------|---------|
| D1 | Spec Conformance & Structural Integrity | 5 | 2 | 2.5 | Legacy `url` points to `https://mcp.Wednesday.com/mcp`; no `protocolVersion`/`preferredTransport`; non-standard `authentication` block instead of `securitySchemes`; name says "MCP Server" | Publish an A2A endpoint with `supportedInterfaces[{url, protocolBinding, protocolVersion}]` and standard `securitySchemes` |
| D2 | Enterprise Relevance & Business Value | 15 | 3 | 11.25 | "Wednesday.com boards, items, columns, and workflows"; tags `project-management`, `work-management` | State persona and outcome: "for project and ops teams tracking work in Wednesday.com" |
| D3 | Delegation Necessity | 15 | 4 | 15.0 | "Update the status column of item 67890 to Done", "Add an item to board 12345": tenant data plus write actions an LLM can't do alone | None |
| D4 | Agent Description Clarity & Scope | 10 | 2 | 5.0 | One sentence, 12 words; "via the GraphQL API" is transport detail; no "use when"/"not for" | Rewrite as role + users + 3–5 jobs + use-when + not-for |
| D5 | Skill Decomposition & Cohesion | 10 | 1 | 2.5 | Single skill `Wednesday-api`: "Full access to the Wednesay.com GraphQL API … and more" | Split into create item, update item status/fields, query board items, create board, manage automations |
| D6 | Skill Description Precision | 10 | 2 | 5.0 | Verb + objects + system present, but no inputs, outputs or limits; "and more" is unbounded | Per skill: "Requires board ID… Returns item ID and URL… Only boards the user can access." |
| D7 | Example Utterance Quality & Coverage | 15 | 3 | 11.25 | 4 realistic examples, 3 with identifiers ("board 12345", "item 67890"); all imperative, no indirect phrasing | 3–5 examples per split skill, including indirect asks ("what's still open for the Q3 launch?") |
| D8 | Routing Discriminability & Boundaries | 10 | 2 | 5.0 | Unique vocabulary ("Wednesday.com", "board") but no exclusions; "tasks", "sprint board" collide with Jira/Planner agents; probe 6/9 | Add "Only for work tracked in Wednesday.com; does not handle Jira issues, calendars or documents." |
| D9 | Action Semantics & Interaction Contract | 5 | 1 | 1.25 | "manage … users, workspaces, automations" implies writes and possibly deletes; no read/write split or confirmation | Mark read-only vs write skills; require confirmation before deletes or user/workspace changes |
| D10 | Trust, Security & Governance Signals | 5 | 2 | 2.5 | `"authentication": {"schemes": ["oauth2"]}` is non-standard (linter: "no securitySchemes declared"); provider, docs and semver present | Declare OAuth2 in `securitySchemes` with least-privilege scopes (`boards:read`, `boards:write`) |
| | **Total** | **100** | | **61.3** | | |



## LF A2A Agent query builder:

This skill accepts agent cards, imperfect query set(optional), grounding data, and a list of enterprise management solutions these agents are going to be based of. It does a research on those enterprise applications and then look at the agent cards and grounding data to generate queries - positive or negative. Also provides what the response expectation should be. 
