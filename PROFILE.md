# FIT Profile Maintenance

The parser uses one static interoperability table in `src/profile.ts` for
normal installs, builds, tests, and releases. It contains message and field
identifiers, names, wire types, array behavior, scales, offsets, units, enum
labels, and product identifiers. `npm run profile:check` pins full-table
fingerprints and the resulting message, field, type, enum-value, and product
counts so accidental drift fails CI.

## Unknown and newer fields

A FIT definition contains enough wire metadata to retain a field even when the
maintained table cannot assign it a semantic name. Pass
`includeUnmappedMessages: true` to expose unmapped native or unresolved
developer fields in `unmapped_messages`, including:

- global message number and occurrence index;
- endianness and reconstructed compressed timestamp, when applicable;
- field-definition number and FIT base-type byte;
- an exact copy of the field's wire bytes.

The opt-in keeps default decoded results unchanged. Consumers that need a
complete raw representation of selected messages can continue to use
`includeRawMessages`; `unmapped_messages` stores only the fields the maintained
table cannot decode.

## Updating the table

Every mapping change requires focused regression coverage. Do not guess
adjacent identifiers or add a mapping solely to make `unmapped_messages`
disappear. Update `src/profile.ts`, the relevant tests, and the public types,
then verify the complete compatibility contract:

```sh
npm run codegen
npm run profile:check
npm run check
npm run compatibility:check -- /path/to/reference-package /path/to/fit-corpus
npm run corpus:check -- ../FIT-test-files --allow-force-recovery
```

`src/fit_types.ts` is generated from the maintained table and must not be
edited manually.
