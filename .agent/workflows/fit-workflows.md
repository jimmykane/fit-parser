---
description: common fit-parser development workflows
---

# fit-parser Workflows

Run commands from the repository root.

## Set Up

1. Use a supported Node.js version from `package.json` (Node 20 or newer).
2. Install the locked dependencies:

   ```sh
   npm ci
   ```

## Inspect a FIT File

Build before using the inspection scripts so they read the current source:

```sh
npm run build
node scripts/inspect_fit.js /absolute/path/to/activity.fit [message_key]
node scripts/deep_probe.js /absolute/path/to/activity.fit <value> [tolerance]
```

Keep private or user-provided FIT files outside the repository. Do not copy
them into `.agent`, `test`, or `examples`.

## Fix Decoder Behavior

1. Reduce the failure to synthetic bytes or a `FitEncoder` fixture.
2. Make low-level decoder changes in `src/binary.ts`.
3. Add focused coverage in `test/binary-performance-regression-test.ts` or a
   purpose-specific regression test.
4. Add a parser-level test when the behavior crosses message boundaries.
5. Run the focused test:

   ```sh
   npm test -- --run test/<test-file>.ts
   ```

6. Run the complete preflight:

   ```sh
   npm run check
   ```

## Add or Update a FIT Profile Message

1. Locate the message and field definitions in the pinned
   `@garmin/fitsdk` profile.
2. Update the source profile in `src/fit.ts`.
3. Regenerate `src/fit_types.ts`:

   ```sh
   npm run codegen
   ```

4. Add or update tests in `test/`.
5. Verify generated output is current and run all checks:

   ```sh
   npm run check
   ```

## Update Garmin Product Mappings

1. Update the pinned `@garmin/fitsdk` dependency only when the required
   profile data is absent from the current version.
2. Synchronize `FIT.types.garmin_product` in `src/fit.ts` from the SDK
   `Profile.types.garminProduct` mapping.
3. Run:

   ```sh
   npm test -- --run test/garmin-product-profile.test.ts
   npm run codegen
   npm run check
   ```

## Before a Commit or Pull Request

```sh
git diff --check
npm run check
git status --short
```
