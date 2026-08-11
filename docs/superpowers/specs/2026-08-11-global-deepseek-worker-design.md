# Global DeepSeek Implementation Worker

Date: 2026-08-11
Status: approved by user

## Goal

Make DeepSeek V4 Flash the implementation worker for all local Codex projects while keeping GPT-5.6 with ChatGPT Plus as the primary planner, investigator, reviewer, and final decision-maker. Avoid native cross-provider `spawn_agent` delegation and run DeepSeek in a separate non-interactive Codex process.

## Considered approaches

### 1. Native cross-provider subagent

Keep `deepseek_worker` as a custom Codex subagent and invoke it through `spawn_agent`. This is the most integrated interface, but the current orchestrator rejects or misroutes the child model before the DeepSeek process starts. It is not selected.

### 2. External OpenCode worker

Invoke the installed OpenCode CLI with the DeepSeek provider. This can provide a capable coding-agent loop, but it introduces another agent runtime, configuration format, permission model, and session store. It remains a fallback if the official DeepSeek Codex integration stops working.

### 3. Separate `codex exec` profile — selected

Run `codex exec --profile deepseek-worker` as a separate process. The primary GPT process prepares a bounded implementation specification, DeepSeek edits the current workspace, and GPT independently reviews the resulting diff and validation results. This uses the official Codex Responses API integration documented by DeepSeek and preserves the normal OpenAI configuration for the primary process.

## Architecture

The integration is user-global and applies to every local project:

- `~/.codex/config.toml` keeps OpenAI and GPT-5.6 as the primary default and defines the reusable DeepSeek provider.
- `~/.codex/models.json` contains the complete official DeepSeek Codex catalog required by the installed Codex version.
- `~/.codex/deepseek-worker.config.toml` overlays the DeepSeek model, provider, catalog, reasoning, approval, and agent settings for worker runs only.
- `~/.codex/bin/deepseek-worker` is the global launcher invoked from any repository. It accepts the complete implementation specification through standard input.
- `~/.codex/AGENTS.md` defines the global delegation and review protocol inherited by all projects.

Project-level `AGENTS.md` files continue to apply after the global instructions and may add project-specific commands and invariants. They must not be copied or rewritten solely to enable DeepSeek.

## Configuration requirements

### Primary Codex

- Keep `model = "gpt-5.6"`.
- Keep `model_provider = "openai"`.
- Keep the existing ChatGPT authentication flow and Plus subscription behavior.
- Do not add DeepSeek authentication selectors at the top level.

### DeepSeek provider

- Define provider id `deepseek` with `base_url = "https://api.deepseek.com/"`.
- Use `wire_api = "responses"`.
- Read authentication from `DEEPSEEK_API_KEY`; never embed the key in TOML, scripts, prompts, or repositories.
- Preserve unrelated MCP servers, plugins, project trust settings, notifications, and desktop preferences.

### DeepSeek worker profile

- Use `model = "deepseek-v4-flash"`.
- Use `model_provider = "deepseek"`.
- Use the official `models.json` catalog.
- Use high reasoning effort.
- Use `approval_policy = "never"` because the launcher is non-interactive.
- Disable nested agents so the worker cannot recursively delegate.
- Select `workspace-write` at invocation time rather than granting broader filesystem access in the profile.

## Delegation protocol

The primary GPT agent owns:

- understanding user intent;
- reading the relevant code and project instructions;
- root-cause analysis;
- architecture and API decisions;
- task decomposition;
- the bounded implementation specification;
- review of the actual diff;
- independent validation;
- the final response to the user.

DeepSeek owns:

- bounded implementation after behavior is understood;
- tests for established behavior;
- mechanical refactoring;
- type updates;
- repetitive code changes;
- concrete corrections requested after GPT review.

Before invoking DeepSeek, GPT must provide:

1. Objective.
2. Established root cause or intended behavior.
3. Relevant files or subsystem when known.
4. Required changes.
5. Invariants that must remain unchanged.
6. Explicit non-goals.
7. Validation requirements.

Only one write-capable DeepSeek worker may run in a repository at a time.

## Automatic invocation rules

The global instructions require GPT to use the external DeepSeek worker automatically when the user requests code implementation and the required behavior is sufficiently understood.

Suitable work includes:

- implementing an approved component or feature;
- changing multiple files according to a clear plan;
- adding regression tests for established behavior;
- performing a bounded refactor or migration;
- implementing a known API integration;
- correcting concrete review findings.

GPT must not delegate unresolved architecture, vague investigation, final review, secret handling, or broad open-ended redesign to DeepSeek. GPT completes the investigation first and delegates only the implementation portion.

## Launcher behavior

The launcher must:

- fail if `DEEPSEEK_API_KEY` is unavailable;
- fail if the received task is empty;
- fail clearly when it is not run inside a project workspace;
- invoke the bundled/current Codex CLI through the `deepseek-worker` profile;
- run with `--sandbox workspace-write` and `--ephemeral`;
- pass the complete task without shell interpolation hazards;
- preserve stdout and stderr so the primary agent can inspect progress and the final summary;
- return the underlying Codex exit status;
- never print the API key;
- never enable `danger-full-access`.

The launcher may operate in a dirty worktree because Codex commonly works with user-owned uncommitted changes. The delegation prompt and global instructions must require preserving unrelated changes. GPT must record and inspect the pre-existing status before delegation.

## Review and correction loop

After every DeepSeek run, GPT must independently inspect:

- `git status --short`;
- `git diff` and any newly created files;
- project-specific type checks, lint, tests, and builds appropriate to the change;
- requirement compliance and unrelated modifications.

GPT must review the code for correctness, regressions, async behavior, state ownership, stale closures, cleanup, cache invalidation, API contracts, TypeScript safety, security, and missing edge cases where relevant.

If a concrete defect is found, GPT prepares a narrow correction specification and invokes the same DeepSeek worker again. A correction must preserve the already-correct parts of the previous implementation. The normal limit is two DeepSeek implementation/correction cycles per task.

Because the user explicitly requires DeepSeek to write the code, GPT must not silently replace it with an OpenAI implementation worker. If DeepSeek still fails after a justified retry, GPT reports the exact blocker and stops unless the user explicitly authorizes another implementation path.

## Error handling

The workflow must distinguish:

- missing key;
- profile or catalog parsing failure;
- unsupported model or client version;
- authentication or account failure;
- DeepSeek API/network failure;
- Codex tool-call failure;
- validation failure after a successful edit;
- unacceptable or unrelated diff.

Provider, authentication, model availability, and configuration failures are not retried repeatedly. A transient API/network failure may receive one retry. Code-quality failures return through the correction loop rather than restarting the whole task.

## Security

- Never send API keys, passwords, tokens, secret-store contents, `.env` contents, or unrelated credentials to DeepSeek.
- Never store `DEEPSEEK_API_KEY` in a repository, launcher, profile, or model catalog.
- The worker receives only the current project workspace under `workspace-write` sandbox rules.
- The primary GPT agent decides whether external network access is required; it is not enabled globally for the worker.
- Existing unrelated user changes must not be reverted, overwritten, or reformatted.

## Validation plan

Validate the integration in increasing-risk stages:

1. Confirm the installed Codex version satisfies the DeepSeek catalog minimum.
2. Parse the base config, profile, and model catalog without exposing credentials.
3. Run an ephemeral read-only identity check expecting an exact marker.
4. Run an ephemeral read-only repository inspection.
5. Run a workspace-write smoke test that creates one uniquely named temporary file and changes nothing else.
6. Verify the file content and inspect the diff/status.
7. Remove only the smoke-test file after its exact path and contents are confirmed.
8. Run a bounded real implementation through the global launcher, then perform GPT review and project validation.

## Acceptance criteria

- The normal Codex session still uses GPT-5.6 and the existing ChatGPT authentication.
- `deepseek-worker` works from any trusted local Git repository without project-local wrapper files.
- The actual API model used by the worker is `deepseek-v4-flash`.
- DeepSeek can read, create, and edit files inside the current workspace.
- Nested subagents are unavailable inside the worker process.
- The API key never appears in command output, configuration files, Git changes, or prompts.
- GPT inspects the real diff and runs relevant validation after every worker run.
- Failures never cause a silent switch to an OpenAI implementation model.
- Existing uncommitted user changes remain intact.

## Out of scope

- Fixing or patching the native `spawn_agent` orchestrator.
- Making DeepSeek the default model for interactive Codex sessions.
- Using DeepSeek V4 Pro before its Codex integration is officially supported and verified.
- Installing or configuring OpenCode unless the selected Codex integration becomes unusable and the user approves the fallback.
- Committing project implementation changes automatically.
