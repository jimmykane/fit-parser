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

1. Establish the message and field definitions from documented project
   history, independently observed FIT files, or redistributable
   interoperability documentation.
2. Inspect `unmapped_messages` from a synthetic or externally held FIT file to
   confirm the global message number, field number, wire type, and bytes.
3. Update the focused correction table in `src/profile.ts`; do not copy a
   complete external profile or add a second overlay elsewhere.
4. Regenerate public types:

   ```sh
   npm run codegen
   npm run profile:check
   ```

5. Review the profile and generated type diffs and add or update tests in
   `test/`.
6. Verify generated output is current and run all checks:

   ```sh
   npm run check
   ```

## Update Product Mappings

1. Inspect the static product mapping in `src/profile.ts`.
2. Establish each product identifier from project history, observed FIT data,
   or redistributable interoperability documentation.
3. Apply supported changes manually with focused regression tests.
4. Run:

   ```sh
   npm test -- --run test/product-profile.test.ts
   npm run codegen
   npm run profile:check
   npm run check
   ```

## Check an External FIT Corpus

Keep the corpus outside the repository. The standard contributor layout is a
sibling checkout:

```sh
git clone https://github.com/ThomasKuehne/FIT-test-files.git ../FIT-test-files
npm run corpus:check -- ../FIT-test-files --allow-force-recovery
```

The command accepts any corpus path. This corpus contains a known header-CRC
failure that should recover only in force mode; it reports aggregate counts and
never prints filenames or parsed activity data.

## Before a Commit or Pull Request

```sh
git diff --check
npm run check
git status --short
```
