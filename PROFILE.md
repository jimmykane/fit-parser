# FIT Profile Maintenance

The parser ships community-maintained interoperability tables in
`src/profile.ts` and `src/profile-compatibility.ts`. They are ordinary project
source: normal installs, builds, tests, and releases do not download, import,
inspect, or generate code from an external FIT SDK.

## Source boundary

The maintained baseline is reconstructed from fit-file-parser's own
MIT-licensed Git history:

- Message, field, and general type definitions come from commit
  `bdb75af90b750d6c96d12429a93495742122f135`, the last handwritten table before
  profile code generation was introduced.
- The product-name map comes from commit
  `6b9eab173125e4d3be4fd9e0a7c1d79c8438d854`, before the project introduced an
  SDK-based product synchronization step.

`PROFILE_SOURCE` records those immutable commits, and `npm run profile:check`
pins full-table fingerprints as well as the resulting message, field, type,
enum-value, and product counts.

The baseline is supplemented in two layers:

- `src/profile-compatibility.ts` statically preserves the semantic surface of
  the project's public 5.2.1 parser release. All 631 field additions over the
  handwritten baseline were independently observed by global message number,
  field number, wire base type, and size in the regression corpus. The public
  5.2.1 contract supplies their established names, scales, units, and enum
  labels.
- A focused correction table in `src/profile.ts` retains later fixture-backed
  fields and parser corrections that are outside that compatibility surface.

The compatibility source is maintained as a reviewed static delta rather than
an SDK-generated table. The 5.2.1 release originally documented its expanded
profile as SDK-based; preserving its already-published behavior does not by
itself establish the licensing status of the upstream profile data.

## Unknown and newer fields

A FIT definition contains enough wire metadata to retain a field even when the
maintained table cannot assign it a semantic name. The parser therefore exposes
every unmapped native or unresolved developer field automatically in
`unmapped_messages`, including:

- global message number and occurrence index;
- endianness and reconstructed compressed timestamp, when applicable;
- field-definition number and FIT base-type byte;
- an exact copy of the field's wire bytes.

This prevents newer messages from being silently discarded. Consumers that
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
change description. When a mapping restores an already-published compatibility
contract, verify its field identity against the corpus and add it to
`src/profile-compatibility.ts`; keep project-specific corrections in
`src/profile.ts`. Then:

```sh
npm run codegen
npm run profile:check
npm run check
npm run corpus:check -- ../FIT-test-files --allow-force-recovery
```

`src/fit_types.ts` is generated from the maintained table and must not be
edited manually.
