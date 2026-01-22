# FIT Parser Development Rules

You are working on the `fit-parser` library. Follow these rules strictly to ensure correctness and stability.

## Core Principles

1.  **Trust the Official SDK**:
    *   Always verify Message IDs and Field IDs against the Official Garmin FIT SDK (`@garmin/fitsdk`).
    *   **NEVER** guess or reuse existing IDs if they seem wrong (e.g., Message 140 vs 285).
    *   If `@garmin/fitsdk` is available in `node_modules`, use it as the source of truth.

2.  **Investigation First**:
    *   If a field is missing, use `npm run inspect <file>` or `npm run probe <file> <value>` BEFORE modifying code.
    *   Confirm the field exists in the file and identify its raw value.

3.  **Testing is Mandatory**:
    *   Every new message or field definition MUST have a corresponding test case in `test/`.
    *   Test against real FIT files whenever possible (use `examples/` directory).
    *   Use `npm run test` to verify changes.

4.  **Code Generation**:
    *   `src/fit_types.ts` is AUTO-GENERATED.
    *   If you modify `src/fit.ts`, you **MUST** run `npm run codegen` to update types.
    *   Do not edit `src/fit_types.ts` manually.

## Workflow checklist

When adding a new message or fixing a field:

- [ ] Locate official Message ID in Garmin SDK
- [ ] Locate Field IDs and Types in Garmin SDK
- [ ] Update `src/fit.ts` with new definition
- [ ] Run `npm run codegen`
- [ ] Add/Update test in `test/`
- [ ] Run `npm run build && npm run test`
