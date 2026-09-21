# FIT Parser Development Rules

These repository-specific rules apply to automated and human contributors.

## Protocol correctness

- Treat the static profile in `src/profile.ts` as the source of truth
  for standard message IDs, field IDs, base types, scales, offsets, units, and
  product mappings.
- Do not guess protocol IDs or infer them from nearby entries.
- Preserve byte alignment under every parser mode. Unknown native and
  unresolved developer fields must retain their exact bytes in
  `unmapped_messages`.
- Preserve existing public output names and unit conversions unless the
  change explicitly updates the public API. Do not add compatibility aliases
  or derived values to parsed messages.

## Profile and generated files

- Standard profile definitions in `src/profile.ts` are maintained through
  reviewed source changes. Every mapping change requires focused regression
  coverage.
- Keep standard definitions and focused corrections in
  `src/profile.ts`; do not add a second profile or overlay table elsewhere.
- `src/fit_types.ts` is generated. Do not edit it manually.
- After changing `src/profile.ts`, `src/fit.ts`, the type generator, or profile
  handling, run `npm run codegen` and commit the generated public types.
- Use `npm run codegen:check` to detect stale generated output.
- Use `npm run profile:check` to verify maintained counts, fingerprints,
  metadata structure, and runtime wiring.
- Do not import, generate, or mechanically synchronize the maintained profile
  from another package.

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
