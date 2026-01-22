---
description: common fit-parser development workflows
---

# Inspect FIT File

// turbo
1. node scripts/inspect_fit.js <path_to_fit_file> [message_key]

# Probe FIT File for Value

// turbo
1. node scripts/deep_probe.js <path_to_fit_file> <value> [tolerance]

# Run Tests

// turbo
1. npm run build && npm run test

# Add New Message

1. Locate Message ID in `@garmin/fitsdk/src/profile.js`
2. Update `src/fit.ts` with message definition
// turbo
3. npm run codegen
4. Add test in `test/`
// turbo
5. npm run build && npm run test
