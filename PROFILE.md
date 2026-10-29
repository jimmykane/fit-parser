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

The unsigned-byte record-temperature interoperability recovery also retains
the original byte here, even when its unambiguous value is decoded.

## Focused interoperability additions

The Garmin product table includes all 499 product identifiers documented in
[Garmin profile 21.218.0](https://github.com/garmin/fit-javascript-sdk/blob/992cfad3b8f99537765d552a75b5e760e442e7f2/src/profile.js).
The 20 additions in 6.2.4 include Forerunner 970 and 570, newer fēnix and
Approach variants, Enduro 4, Cirqa Smart Band and TrainingPeaks Virtual.
Regression tests verify the added lookups and preserve numeric FIT product
identifiers. This is a checked coverage baseline, not automatic SDK syncing.

Session fields 79, 80, 106, 107, 108, and 211; lap fields 27–30, 73, 90, 96,
97, 155, and 161; and battery message 104 fields 2 and 253 were checked against
independently observed wire definitions in the external FIT corpus and the
redistributable interoperability definitions for
[session](https://github.com/muktihari/fit/blob/126e1a11233f87b7f139254d991bc3d2d952b62c/profile/mesgdef/session_gen.go),
[lap](https://github.com/muktihari/fit/blob/126e1a11233f87b7f139254d991bc3d2d952b62c/profile/mesgdef/lap_gen.go),
and [battery](https://github.com/muktihari/fit/blob/126e1a11233f87b7f139254d991bc3d2d952b62c/profile/mesgdef/battery_gen.go).
The focused mappings expose swimming summaries, segment and shift counts,
lap bounds, metabolic calories, grade-adjusted speed, and battery samples.
Synthetic regression tests pin identifiers, wire types, scales, units, invalid
sentinels, and collection behavior. Other battery fields remain unmapped.

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
npm run corpus:check -- ../FIT-test-files --allow-force-recovery --all-files
```

`src/fit_types.ts` is generated from the maintained table and must not be
edited manually.

`--all-files` validates every appended FIT file through `parseFilesAsync()` and
reports both parsed FIT file counts and concatenated input counts. Recovery
counts apply to whole inputs; unmapped summaries count each parsed FIT file
separately in this mode.
