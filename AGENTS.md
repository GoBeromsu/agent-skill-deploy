# agent-skill-deploy

- `src/**` is repo-local implementation. Do not reintroduce boiler-template-synced runtime files under `src/`.
- Shared, repo-agnostic contracts and harnesses may remain synced in top-level config, CI, and release script surfaces when they do not encode plugin-specific behavior.
- Keep provider packaging, GitHub sync behavior, and settings UX local to this repo.
- Verify with `pnpm run ci` after changes.
