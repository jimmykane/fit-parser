# Investigating FIT Files

This guide explains how to investigate FIT files when you suspect fields are missing or incorrectly parsed, and how to add support for new messages.

## Tools Included

We provide scripts in the `scripts/` directory to help you probe FIT files.

### 1. Inspecting Parsed Data (`scripts/inspect_fit.js`)

Use this script to see what the parser currently outputs for a file.

```bash
# View summary of all messages in file
node scripts/inspect_fit.js examples/jumps-mtb.fit

# View specific message details
node scripts/inspect_fit.js examples/jumps-mtb.fit jumps
node scripts/inspect_fit.js examples/jumps-mtb.fit session
```

### 2. Probing for Unknown Data (`scripts/deep_probe.js`)

Use this script when you know a value exists (e.g., from Garmin Connect or another tool) but can't find it in the parser output. It recursively searches the raw parsed structure for that value.

```bash
# Edit the script to set the value you're looking for, then run:
node scripts/deep_probe.js
```

## Workflow for Missing Fields

If you suspect a field is missing (e.g., "Jump Hang Time"):

1.  **Verify it exists**: Check the file with an external tool or online viewer. Note the exact value (e.g., `0.36` seconds).
2.  **Probe**: Use `deep_probe.js` or inspect the `examples/` output to see if the value appears in an unknown field (e.g., `field_123`).
3.  **Identify Message ID**:
    *   Check `src/fit.ts` for the message definition.
    *   If the message ID seems wrong, or fields are missing, compare with the **Official Garmin FIT SDK**.
    *   *Tip: You can find the official SDK in `@garmin/fitsdk` if installed, or search online.*
4.  **Fix**:
    *   Update `src/fit.ts` with the correct Message ID and Field IDs.
    *   Run `npm run codegen` to update types.
    *   Add a test case in `test/` relative to your new message.

## Common Issues

*   **Wrong Message ID**: Sometimes `fit-parser` has legacy or guessed IDs (e.g., `jump` was 140, but official is 285).
*   **Missing Fields**: New devices add new fields. They often appear as `unknown_field_X`.
*   **Scale/Offset**: If values look huge (e.g., 20838184 instead of 20.838), check if they need a scale factor (e.g., `semicircles` to `degrees`).
