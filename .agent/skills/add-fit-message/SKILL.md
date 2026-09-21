---
name: add-fit-message
description: Add a standard FIT profile message or update its fields and public types
---

# Add/Update FIT Message

## Prerequisites

- Install dependencies with `npm ci`.
- Establish the mapping from documented project history, independently
  observed FIT files, or redistributable interoperability documentation.
- Record its global message number and each required field's number, type,
  scale, offset, and units.

## Steps

1. Confirm whether the message already exists in `src/profile.ts`.
2. Confirm the wire identifiers and bytes through a synthetic or externally
   held FIT file and its `unmapped_messages` output.
3. Add the focused mapping to `src/profile.ts`; do not copy a complete external
   profile or add a separate overlay in another source file.
4. Run `npm run codegen` to update `src/fit_types.ts`.
5. Run `npm run profile:check`.
6. Review the profile and generated type diffs.
7. Add a focused test under `test/` that verifies parsed field names, values,
   and types.
8. Run the focused test.
9. Run `npm run check`.

## Guardrails

- Do not edit `src/fit_types.ts` manually.
- Do not guess message or field numbers.
- Do not add compatibility aliases or alternate output spellings.
- Do not commit private FIT files to make a regression reproducible; use
  synthetic data or `FitEncoder`.
- Record the source and rationale for every profile mapping change.
