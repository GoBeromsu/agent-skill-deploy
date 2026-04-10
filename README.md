# Agent Skill Deploy

Package deployable folders from your Obsidian vault into provider-specific GitHub layouts.

The vault is the source of truth. The plugin scans a source root, detects deployable folders, builds a provider-specific package tree, and batch-syncs that packaged output to GitHub.

## Features

- **Vault-first source model** — keep the vault as the SSOT
- **Recursive discovery** — scan the source root recursively
- **Dual folder detection** — support root-note folders and legacy `SKILL.md`
- **Bounded publish grouping** — optional `publish_group` frontmatter adds one nested grouping level
- **Provider-specific packaging** — Claude marketplace layout or Codex plugin layout
- **Exact mirror deploy** — add, update, and delete package outputs in one atomic Git commit
- **GitHub PAT auth** — simple personal access token setup
- **Scoped conflict guard** — compare only the managed packaged output

## Install

### From Obsidian Community Plugins (coming soon)

Search **Agent Skill Deploy** in Settings → Community Plugins.

### Manual

```bash
git clone https://github.com/GoBeromsu/agent-skill-deploy.git
cd agent-skill-deploy
pnpm install
pnpm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/skill-deploy/`.

## Setup

1. Open Settings → Agent Skill Deploy
2. Set **Source root path** — the vault folder to scan, default `55. Tools/Skills`
3. Save a **GitHub personal access token**
4. Choose a **target provider**:
   - `Claude marketplace`
   - `Codex plugin`
5. Configure the target repository:
   - `repo owner` default `GoBeromsu`
   - `repo name` default `claude-code-plugins`
   - `branch`
   - `managed skills path` for Claude, default `skills`
   - `codex plugin path` for Codex, default `plugins/ataraxia-skills`
   - `codex plugin name` for Codex, default `ataraxia-skills`

## Usage

Run the command palette → **Agent Skill Deploy: Validate deploy config** to confirm that the source root, PAT, and repository settings are valid.

Run the command palette → **Agent Skill Deploy: Deploy changed folders** to batch-sync the packaged output.

The deploy flow is:

1. Scan the configured source root recursively
2. Detect deployable folders using:
   - `<folder-name>/<folder-name>.md` with frontmatter `plugin_id`
   - or legacy `SKILL.md`
3. Build a provider-specific package tree
   - Claude: `skills/<skill-name>/...` or `skills/<publish-group>/<skill-name>/...` plus `.claude-plugin/marketplace.json`
   - Codex: `<plugin-root>/.codex-plugin/plugin.json` plus `<plugin-root>/skills/<skill-name>/...` or `<plugin-root>/skills/<publish-group>/<skill-name>/...`
4. Compare the packaged output against the remote managed surface
4. Create one atomic Git commit for all adds, updates, and deletions
5. Store a hash of the managed packaged output for future conflict checks

## Detection Model

- **Root-note mode** — the folder contains `<folder-name>.md` with `plugin_id` in frontmatter
- Optional root-note frontmatter `publish_group` adds one extra grouped path segment during packaging
- **Legacy mode** — the folder contains `SKILL.md`
- If both exist, root-note mode wins for identity and `SKILL.md` is mirrored as a normal file
- Nested folders are preserved as folder contents, not split into separate deploy units once a parent folder is already deployable

## Repository Model

- The plugin no longer assumes Claude and Codex share one repo shape
- Defaults target `GoBeromsu/claude-code-plugins`
- Claude marketplace output:
  - `.claude-plugin/marketplace.json`
  - `skills/<skill-name>/...`
- Codex plugin output:
  - `<plugin-root>/.codex-plugin/plugin.json`
  - `<plugin-root>/skills/<skill-name>/...`
- The vault source folders remain unchanged; only the packaged output differs by provider

## Shared Boundary

- Runtime implementation under `src/` is owned locally in this repo.
- Boiler-template sync is limited to repo-agnostic contract and harness surfaces such as CI/release scripts and lint configuration.
- Provider packaging, deploy-state handling, and plugin UI behavior stay local even when the surrounding workflow contracts are shared.

## Architecture

```text
src/
├── main.ts                # Plugin entry — wires settings, auth, and commands
├── domain/
│   ├── skill-discovery.ts  # Deployable folder detection
│   ├── package-layout.ts   # Provider-specific package builders
│   ├── mirror-plan.ts      # Exact mirror diff planning for packaged files
│   ├── blob-sha.ts         # Git blob SHA + snapshot hashing
│   └── deploy-state.ts     # Managed-scope conflict helpers
├── ui/
│   ├── deploy-command.ts   # Validate + batch deploy workflow
│   ├── github-api.ts       # GitHub tree/commit operations
│   ├── github-auth.ts      # PAT validation + storage
│   ├── token-store.ts      # File-backed token storage
│   ├── vault-adapter.ts    # Obsidian vault scanning + source file reading
│   └── settings-tab.ts     # Source/repo/provider settings UI
├── types/
└── shared/              # Repo-local plugin support modules
```

## Development

```bash
pnpm install
pnpm run dev        # Watch mode with vault sync
pnpm run build      # Type-check + production build
pnpm run test       # Vitest
pnpm run lint       # ESLint
pnpm run ci         # build + lint + test
```

## License

MIT
