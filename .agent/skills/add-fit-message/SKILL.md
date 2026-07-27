---
name: add-fit-message
description: Add a standard FIT profile message or update its fields and generated output
---

# Add/Update FIT Message

## Prerequisites

- Install dependencies with `npm ci`.
- Locate the message in the pinned `@garmin/fitsdk` profile.
- Record its global message number and each required field's number, type,
  scale, offset, and units.

## Steps

1. Confirm whether the message exists in the pinned SDK profile.
2. If it exists, regenerate the profile instead of duplicating it in
   `src/fit.ts`.
3. Use `src/fit.ts` only for a documented private overlay or a
   compatibility-preserving output-name override.
4. Run `npm run codegen` to update
   `src/garmin_profile.generated.ts` and `src/fit_types.ts`.
5. Run `npm run profile:audit`.
6. Review the source and generated diffs.
7. Add a focused test under `test/` that verifies parsed field names, values,
   and types.
8. Run the focused test.
9. Run `npm run check`.

## Guardrails

- Do not edit either generated file manually.
- Do not guess message or field numbers.
- Do not commit private FIT files to make a regression reproducible; use
  synthetic data or `FitEncoder`.
- If the pinned SDK lacks the required profile entry, investigate an SDK
  upgrade separately and review all resulting profile changes.
