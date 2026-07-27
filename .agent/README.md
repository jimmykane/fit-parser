# Agent Workspace

This tracked directory contains repository-specific guidance for automated
contributors. It is documentation only: do not use it for temporary files,
private FIT activities, generated output, or parsed data.

## Contents

- `rules/fit-parser-dev.md` defines protocol, testing, privacy, and Git rules.
- `workflows/fit-workflows.md` lists the supported setup, investigation,
  code-generation, validation, and pull-request commands.
- `skills/add-fit-message/SKILL.md` provides the focused workflow for FIT
  profile additions.

## Repository map

- `src/binary.ts`: binary definition and data-message decoding.
- `src/fit-parser.ts`: parser orchestration and output grouping.
- `src/fit.ts`: source FIT profile and enum mappings.
- `src/fit_types.ts`: generated public TypeScript types.
- `src/type_generator.ts`: type generator.
- `src/fit-encoder.ts`: FIT encoder used by consumers and synthetic tests.
- `test/`: regression and integration tests.
- `scripts/inspect_fit.js`: parsed-message inspection utility.
- `scripts/deep_probe.js`: recursive numeric-value probe.
- `codegen/codegen.ts`: generated-type entry point and consistency check.

## Required preflight

Run the repository's complete validation command before handing off a change:

```sh
npm run check
```

This checks generated files, linting, TypeScript, the complete test suite, and
both ESM and CommonJS builds.
