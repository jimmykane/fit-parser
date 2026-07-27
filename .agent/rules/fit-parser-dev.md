# FIT Parser Development Rules

These repository-specific rules apply to automated and human contributors.

## Protocol correctness

- Treat the pinned `@garmin/fitsdk` profile as the source of truth for
  standard message IDs, field IDs, base types, scales, offsets, units, and
  Garmin product mappings.
- Do not guess protocol IDs or infer them from nearby entries.
- Preserve byte alignment under every parser mode. Unknown fields may be
  omitted, but their declared byte sizes must still be consumed.
- Preserve existing public output names and unit conversions unless the
  change explicitly updates the public API.

## Source and generated files

- Edit `src/fit.ts` for profile changes.
- `src/fit_types.ts` is generated. Do not edit it manually.
- After changing `src/fit.ts` or `src/type_generator.ts`, run
  `npm run codegen` and commit the generated result.
- Use `npm run codegen:check` to detect stale generated output.

## Tests

- Every decoder fix, message addition, or field change requires focused
  regression coverage.
- Prefer synthetic byte arrays or `FitEncoder` output for bug regressions.
  Tests should demonstrate the failure mechanism without committing private
  activities.
- Existing repository-owned FIT fixtures may be used when they are already
  intentionally tracked.
- Run a focused test while iterating and `npm run check` before handoff.

## Private data

- Never commit user-provided FIT files, parsed dumps, paths, device
  identifiers, locations, or timestamps unless the user explicitly approves
  publication.
- Keep one-off private inputs outside the repository and delete temporary
  copies after the investigation.
- Do not mention private fixture names or contents in commits or pull
  requests. Describe the protocol-level reproduction instead.

## Git hygiene

- Keep changes scoped to the requested work and preserve unrelated changes.
- Stage explicit paths rather than the whole worktree when the tree is mixed.
- Run `git diff --check` and inspect the staged diff before committing.
