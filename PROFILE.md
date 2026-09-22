# FIT Profile Maintenance

The parser uses one static interoperability profile for normal installs,
builds, tests, and releases. Message definitions and general enum tables live
in `src/profile.ts`; the manufacturer, Garmin product, sport, sub-sport, and
course-point tables live in `src/profile-lookup-data.ts`. The full profile
composes those exact objects, so lookup-only consumers and the decoder share
one authoritative value for every mapping. `npm run profile:check` pins
full-table fingerprints and the resulting message, field, type, enum-value,
and product counts so accidental drift fails CI.

`npm run profile:budget` also bundles the lookup entry point in isolation. It
fails if anything beyond the lookup helpers and their authoritative data enters
that graph, or if the minified bundle exceeds 25,000 bytes. Review any budget
change together with the corresponding profile growth.

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
disappear. Update the owning table in `src/profile.ts` or
`src/profile-lookup-data.ts`, the relevant tests, and the public types, then
verify the complete compatibility contract:

```sh
npm run codegen
npm run profile:check
npm run check
npm run compatibility:check -- /path/to/reference-package /path/to/fit-corpus
npm run corpus:check -- ../FIT-test-files --allow-force-recovery
```

`src/fit_types.ts` is generated from the maintained table and must not be
edited manually.
