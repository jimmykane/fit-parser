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

- Standard profile definitions in `src/garmin_profile.generated.ts` come from
  the pinned Garmin SDK. Do not edit that file manually.
- Use `src/fit.ts` only for parser options, compatibility-preserving naming,
  and explicitly audited private message overlays.
- `src/fit_types.ts` is generated. Do not edit it manually.
- After changing the pinned SDK, `src/fit.ts`, either generator, or profile
  handling, run `npm run codegen` and commit both generated results.
- Use `npm run codegen:check` to detect stale generated output.
- Use `npm run profile:audit` to verify complete standard-message coverage and
  the expected private overlay set.

## Tests

- Every decoder fix, message addition, or field change requires focused
  regression coverage.
- Prefer synthetic byte arrays or `FitEncoder` output for bug regressions.
  Tests should demonstrate the failure mechanism without committing private
  activities.
- Existing repository-owned FIT fixtures may be used when they are already
  intentionally tracked.
- Run a focused test while iterating and `npm run check` before handoff.
- For broad decoder or profile changes, run `npm run corpus:check -- <path>`
  against an external corpus. Add `--allow-force-recovery` only when known CRC
  corruption is an accepted corpus property.

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
