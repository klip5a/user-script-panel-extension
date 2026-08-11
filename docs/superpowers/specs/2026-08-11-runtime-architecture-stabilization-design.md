# Runtime Architecture Stabilization

Date: 2026-08-11
Status: ready for user review

## Goal

Stabilize the extension runtime without rewriting feature business logic. Fix the confirmed type-safety, async ordering, cross-context storage, cleanup, and error-isolation defects found by the architecture review. Preserve the user's existing uncommitted settings changes.

## Considered approaches

### 1. Minimal hotfix

Fix only the TypeScript errors and the stale-settings callback. This is low-risk but leaves confirmed data-loss and lifecycle leaks in place.

### 2. Targeted stabilization — selected

Fix every confirmed P1/P2 defect, add a small explicit runtime controller and feature registry, serialize shared-store mutations through the background context, and add regression tests. Keep existing feature implementations and DOM behavior except where cleanup or cancellation is defective.

### 3. Full feature-platform rewrite

Inject a `FeatureContext` into every feature, replace all singleton services, and consolidate all observers. This could improve the long-term architecture but is too broad and risky for one change.

## Functional requirements

### FR-1: Type safety and quality gate

- `pnpm run typecheck` must pass.
- Import the existing `ComponentParamsRow` type where used.
- Remove the unused `applyVisibilityToDialog` method unless it becomes part of a real execution path.
- Do not weaken `strict`, `noUnusedLocals`, or `noUnusedParameters`.

### FR-2: Latest-settings-wins runtime semantics

- Extract deferred content orchestration from `entrypoints/content.ts` into a testable runtime controller or equivalent focused module.
- Maintain exactly one current settings snapshot.
- Every storage change must update that snapshot before any immediate or deferred application.
- A scheduled idle/timer callback must read the latest snapshot at execution time; it must never replay a captured older snapshot.
- Track `scheduled` and `applied` separately. A newly scheduled task must be cancelable or invalidated by generation.
- Critical CSS settings remain applicable immediately.
- Deferred features still start after user activity or load delay, preserving current startup behavior.
- Runtime disposal must remove storage/event listeners and cancel pending idle/timer work where the content-script context supports invalidation.

### FR-3: Feature orchestration and error isolation

- Replace the hand-written sequence of unrelated calls with a small registry/adaptor structure inside the runtime layer.
- Each registry entry must expose a consistent `start` and `stop` boundary and an enable predicate derived from settings.
- A failure in one feature must be caught, logged with the feature name, and must not prevent later features from being applied.
- Existing always-on behavior remains unchanged in this stabilization; route-aware activation and observer consolidation are explicitly deferred.

### FR-4: Settings storage resilience

- `getExtensionSettings()` must return validated defaults when `chrome.storage.local.get` rejects or returns invalid values.
- Subscription callbacks must not create unhandled promise rejections.
- Side panel initialization and writes must reconcile optimistic UI with storage failures instead of silently leaving an unsaved state.
- Preserve the invariant `catalogEmptyPropertiesPanelVisible => catalogEmptyPropertiesHighlightEnabled`.
- Preserve atomic writes when two related setting keys change together.

### FR-5: Cross-context shared-store serialization

- All read-modify-write mutations of property templates and saved section headers must execute through one authoritative background mutation coordinator.
- Requests from content scripts and side panel use typed runtime messages.
- The background coordinator serializes mutations in arrival order using one queue and always reads the latest store value immediately before applying an operation.
- Reads and watch subscriptions may remain in their current contexts.
- Pure parsing, validation, and mutation functions must remain independent of browser messaging so they can be unit-tested.
- An operation failure must reject only that request and must not poison the mutation queue for later requests.
- Existing storage schemas and keys must remain compatible; no user data reset is allowed.

### FR-6: `SectionFilterSearch` resource ownership

- Track every mounted helper as an owned state object containing helper DOM, portal DOM, listener references, and cleanup logic.
- Remove the portal and all `window`/`document` listeners when its source field detaches and when the service stops.
- Observe relevant removals or prune detached states during reconciliation.
- Repeated AJAX replacement and repeated start/stop must leave at most one live helper per field and no orphan portals.

### FR-7: `ImageInfoHighlight` cleanup and async safety

- Store listener references for each enhanced image/container and remove them on cleanup.
- Clear associated refresh callbacks when a target is removed or the feature stops.
- Repeated off/on cycles must not multiply `load`, `mouseenter`, or `mouseleave` effects.
- Async metadata completions from an older feature generation must not mutate detached badges or restart stopped work.

### FR-8: Remaining async lifecycle safety

- `ProductMassEditor` must own `AbortController` instances for linked-option fetches and abort them on close/stop or when superseded.
- Fetch must reject non-success HTTP responses before parsing HTML.
- `CatalogEmptyPropertiesAudit.loadPanelState()` must ignore stale completion after stop/restart by checking generation/enabled state.
- Cleanup paths must be idempotent.

### FR-9: Backward compatibility of the current settings diff

- Retain the independent empty-property highlight and mini-panel controls already present in the worktree.
- Enabling the mini-panel enables highlighting in the same storage operation.
- Disabling highlighting disables the mini-panel in the same storage operation.
- Effective reads normalize legacy `panelVisible=true` to `highlightEnabled=true`.
- Do not overwrite or revert the user's pre-existing uncommitted changes.

## Non-functional requirements

- No new production dependency unless unavoidable; prefer Node's built-in test runner and WXT/browser APIs already available.
- Chrome MV3 and Firefox builds must continue to pass.
- Avoid a broad UI redesign or changes to Bitrix selectors and business rules.
- Do not introduce a second settings source; legacy `localStorage` hooks may be removed only after confirming they have no consumers.
- New modules should have one responsibility and remain small enough to test independently.

## Test requirements

Add `pnpm test` using Node's built-in test runner and cover at minimum:

1. Deferred settings use the latest value when a newer update arrives before the scheduled callback.
2. A feature failure does not prevent later registry entries from running.
3. Effective settings enforce the panel/highlight invariant and fall back on storage failure.
4. Related side-panel changes produce one atomic multi-key write.
5. Background mutation queue preserves two concurrent template mutations and continues after a rejected mutation.
6. Pure template and section-header mutation functions do not lose unrelated records.
7. `SectionFilterSearch` removes portals and global listeners after detach and stop.
8. `ImageInfoHighlight` does not accumulate listeners across repeated start/stop cycles.
9. Stale catalog panel-state loads are ignored.
10. Product option requests abort on close/stop.

Tests may use narrow browser/DOM fakes. Do not add a large browser test framework solely for this change.

## Verification commands

- `pnpm test`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run build:firefox`
- `git diff --check`

## Acceptance criteria

- All verification commands succeed.
- Reviewer reports no P0/P1/P2 correctness findings in the final diff.
- Rapid setting toggles cannot be reverted by an older deferred callback.
- Concurrent shared-store mutations are serialized without lost updates.
- Feature stop/restart and AJAX replacement leave no known orphan DOM, duplicated listeners, or stale async mutations for the features in scope.
- Existing storage data and the user's current uncommitted changes remain intact.

## Out of scope

- Rewriting every feature to accept a dependency-injected `Document`.
- Consolidating all document-wide observers into one observer.
- Route-aware lazy imports and content-script bundle splitting.
- UI redesign or new end-user functionality.
- Fixing the intentional default behavior of the new empty-property highlight unless product requirements change.
