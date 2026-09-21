# FIT Profile Maintenance

The parser ships one community-maintained interoperability table in
`src/profile.ts`. It is ordinary project source: normal installs, builds,
tests, and releases do not download, import, inspect, or generate code from an
external FIT SDK.

## Source boundary

The table preserves fit-file-parser's public 5.2.1 semantic decoding contract:
message and field identifiers, names, wire types, array behavior, scales,
offsets, units, enum labels, and product identifiers. `PROFILE_SOURCE` records
the immutable release commit. `npm run profile:check` pins full-table
fingerprints and the resulting message, field, type, enum-value, and product
counts so accidental drift fails CI.

The profile is deliberately kept as one table. There is no generated file,
overlay, or post-merge correction layer whose precedence could change consumer
output.

## Unknown and newer fields

A FIT definition contains enough wire metadata to retain a field even when the
maintained table cannot assign it a semantic name. Pass
`includeUnmappedMessages: true` to expose unmapped native or unresolved
developer fields in `unmapped_messages`, including:

- global message number and occurrence index;
- endianness and reconstructed compressed timestamp, when applicable;
- field-definition number and FIT base-type byte;
- an exact copy of the field's wire bytes.

The opt-in keeps the default decoded result identical to 5.2.1. Consumers that
need a complete raw representation of selected messages can continue to use
`includeRawMessages`; `unmapped_messages` stores only the fields the maintained
table cannot decode.

## Updating the table

Every mapping change must have a reviewable source that can be maintained with
the project. Suitable evidence includes:

- documented project history;
- a repository-owned or synthetic FIT regression;
- independently observed files whose private contents are not committed; or
- redistributable interoperability documentation.

Do not guess adjacent identifiers or add a mapping solely to make
`unmapped_messages` disappear. Record the source and rationale in the test or
change description, update `src/profile.ts`, and verify the complete 5.2.1
compatibility contract. Then:

```sh
npm run codegen
npm run profile:check
npm run check
npm run compatibility:check -- /path/to/fit-file-parser-5.2.1 /path/to/fit-corpus
npm run corpus:check -- ../FIT-test-files --allow-force-recovery
```

`src/fit_types.ts` is generated from the maintained table and must not be
edited manually.
