<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

# CODEX — TOKEN-EFFICIENT DEVELOPMENT

## Core Rules
- Minimize token usage without sacrificing code quality.
- Work only on files and packages relevant to the task.
- Never scan the entire monorepo unless necessary.
- Use targeted searches instead of reading large directories.
- Exclude node_modules, .turbo, .next, dist, build,
  coverage, generated files, and lockfiles from searches.
- Never reread unchanged files unnecessarily.
- Keep terminal output short. Avoid dumping logs or large files.
- Avoid unnecessary explanations, repeated analysis,
  and excessive tool calls.

## Development
- Make minimal, production-ready changes.
- Reuse existing components, utilities, and architecture.
- Never refactor unrelated functionality.
- Avoid creating unnecessary files or dependencies.
- Do not rewrite working code.
- Handle simple tasks directly without extensive planning.
- Split large tasks into small, independently verifiable phases.
- Avoid unnecessary parallel agents or duplicate investigations.

## Turborepo
- Work within the affected workspace whenever possible.
- Use package-specific checks instead of monorepo-wide builds.
- Respect the existing Turborepo-managed instructions above.
- Read installed Turborepo documentation when changing
  Turborepo configuration or commands.
- Do not run full monorepo tests unless required.

## Testing
- Run focused tests, linting, and type checks.
- Avoid repeating successful tests without relevant changes.
- Investigate failures before rerunning commands.
- Never skip essential validation to save tokens.

## Context Management
- Keep responses and progress summaries concise.
- Maintain TASK_PROGRESS.md for genuinely large tasks only.
- Record completed work, relevant files, decisions,
  pending tasks, and blockers.
- Keep checkpoints under 300 words.
- Resume from checkpoints without repeating full analysis.
- Avoid repeatedly updating progress files for trivial edits.

## Output
Report only:
1. Changes made
2. Tests and results
3. Remaining issues

Do not generate lengthy summaries unless requested.

## Priority
Optimize total token consumption, not just response length.
Favor efficient investigation, targeted edits, and reliable
implementation over excessive reasoning or tool calls.

Apply these rules automatically to all development tasks.
