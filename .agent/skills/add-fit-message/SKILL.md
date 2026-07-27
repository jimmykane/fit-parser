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

1. Add or update the message definition in `src/fit.ts`.
2. Run `npm run codegen` to update `src/fit_types.ts`.
3. Review both the source and generated diffs.
4. Add a focused test under `test/` that verifies parsed field names, values,
   and types.
5. Run the focused test.
6. Run `npm run check`.

## Guardrails

- Do not edit `src/fit_types.ts` manually.
- Do not guess message or field numbers.
- Do not commit private FIT files to make a regression reproducible; use
  synthetic data or `FitEncoder`.
- If the pinned SDK lacks the required profile entry, investigate an SDK
  upgrade separately and review all resulting profile changes.
