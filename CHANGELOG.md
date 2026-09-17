# Change Log

## Unreleased

## 5.2.1

### Fixed

- Preserve unusual vendor field definitions in lossless raw-message output so
  domain consumers can validate only the messages they understand.
- Add corpus checks for raw-message-only and combined raw/decoded parsing.

## 5.2.0

### Added

- Add opt-in, message-filterable `raw_messages` output with exact native and
  developer-field bytes, wire base types, endianness, message occurrence, and
  reconstructed compressed timestamps. Existing decoded output remains
  unchanged when the option is disabled.
- Add `rawMessagesOnly` for bounded metadata consumers that do not need decoded
  activity collections alongside retained messages.

### Fixed

- Decode compressed timestamp records without consuming bytes for the omitted
  timestamp field.

## 5.1.0

### Added

- Add opt-in, message-filterable `raw_developer_fields` output with exact
  developer-field bytes, global-message occurrence, developer-data index, and
  field-definition number. Existing decoded output remains unchanged when the
  option is disabled.

## 5.0.2

### Fixed

- Clarify the 5.0 migration for standard session field 196: use canonical
  `metabolic_calories` rather than the old duplicate `resting_calories` label.
- Clarify that the removed guessed `recovery_advisor` label was standard
  session field 140, which the SDK defines as `avg_depth` in meters.

## 5.0.1

### Fixed

- Run CI and version-driven npm publishing from the repository's `main`
  branch, with a guarded manual recovery path for a missed release.

## 5.0.0

### Changed

- Generate the complete standard message, field, and type surface from the
  pinned Garmin FIT SDK without handwritten standard-profile overrides.
- Preserve SDK alphanumeric tokens when generating public `snake_case` names,
  including `n2`, `po2`, `time128`, and Garmin product identifiers.
- Restrict non-SDK support to a collision-checked allowlist of Garmin fields
  and private messages observed in the external FIT corpus.
- Emit only parsed FIT values: Garmin product names are no longer inferred,
  and record elapsed/timer values are generated only when
  `elapsedRecordField: true` is requested.

### Breaking

- Remove compatibility aliases such as `resting_calories`,
  `recovery_advisor`, `repeat_dive_time`, and deprecated time-in-zone names.
- Remove guessed stress fields, handwritten enum/type additions, placeholder
  zero-mask names, and the misspelled `hip_swing_excercise_name` type.
- Use the pinned SDK's `cadence_zone_high_bondary` spelling and generated
  alphanumeric field/type spellings instead of manual corrections.
- Correct generated declarations to expose runtime `Date` values, numeric FIT
  `bool` fields and unknown enum IDs, decoded mask objects, nullable array
  entries, and optional profile fields.
- Keep undated cascade rows in file order and avoid duplicating them when a lap
  or session boundary timestamp is absent.

## 4.1.1

### Fixed

- Apply Garmin FIT profile scale and offset to primitive numeric fields, while
  retaining semicircle conversion only for fields declared in semicircles.
- Apply FIT developer-field offsets with the parser's equivalent signed form,
  including scaled signed developer values.
- Decode native diving ascent-rate fields as meters per second instead of
  geographic coordinates.
- Decode native dive depth and bottom-time fields with their Garmin FIT SDK
  scale instead of exposing their encoded integer representation.
- Keep the pinned Garmin SDK authoritative for standard field types, arrays,
  scales, offsets, and units while retaining compatible public field names.

## 4.1.0

### Added

- Generate all 124 standard messages, 1,406 fields, and 200 profile types from
  the exactly pinned Garmin FIT SDK 21.208.0 profile.
- Retain every recognized message in file order under the typed
  `ParsedFit.messages` index without changing existing list, cascade, or
  singleton outputs.
- Decode Garmin strength-training `set` messages in list and cascade modes.
- Add reproducible generated-profile and privacy-safe external corpus audits,
  and enforce profile freshness and coverage in CI.

### Fixed

- Decode fields from their wire base types, including compatible developer
  enum/uint8/byte definitions and correctly sized numeric arrays.
- Reconstruct compressed timestamps and keep timestamp state isolated between
  parser instances.
- Accept omitted header CRCs, validate file CRCs across the complete FIT header
  and data section, and report strict header and file CRC failures explicitly.
- Reject structurally unsafe FIT inputs consistently in callback and Promise
  APIs while retaining force-mode recovery for CRC corruption.
- Correct Garmin profile mappings for OHR settings, monitoring HR, sleep,
  time-in-zone, altitude offsets, and lap/segment flow and grit summaries.
- Correct Celsius-to-Kelvin conversion, add `celsius` as the canonical
  temperature unit, and retain `°C` as a supported alias.

### Compatibility and documentation

- Preserve compatible legacy field names, scales, value shapes, parser
  signatures, output modes, and date behavior while adding canonical profile
  names.
- Add regression coverage for temperature, pressure, validation, compressed
  timestamps, generated profile messages, repeated messages, and MTB
  flow/grit data.
- Refresh the README with current runtime, API, units, output modes, developer
  fields, encoder behavior, and repository commands.

## 4.0.2

- Preserve record alignment when developer-field descriptions are missing or
  appear after their message definitions.
- Decode subsequent developer-field values once their descriptions become
  available, in both strict and force modes.

## 4.0.0

### FIT decoder performance

- Parse `ArrayBuffer` inputs and exact Node.js `Buffer` views directly, avoiding a full copy of the source file.
- Reuse one parse-local `DataView` instead of allocating temporary views for each supported endian field.
- Cache standard field metadata and enum/mask lookups on reusable message definitions.
- Reuse raw field storage for records that share a local message definition.
- Generate elapsed and timer fields once per record instead of once per decoded field.
- Skip header and file CRC scans in `force: true` mode, where CRC mismatches are intentionally ignored; strict mode continues to validate both CRCs.
- Preserve legacy malformed-field zero-padding, field-boundary, developer-field, invalid-value, and offset-buffer behavior.

### Measured benefit

- Suunto 93-hour / 7.5 MB FIT decoding: 1.057 s to 0.375 s, a 64.5% reduction.
- Garmin 110-hour / 28.6 MB FIT decoding: 3.643 s to 1.241 s, a 65.9% reduction.
- Input-related array-buffer memory is approximately halved by removing the full source copy:
  - Suunto: 15.0 MB to 7.5 MB.
  - Garmin: 57.2 MB to 28.6 MB.

There are no intentional parsed-output or public API changes in this release. Output parity was verified across 162 checked-in fixture/mode combinations, 8,320 generated malformed endian-definition cases, and both private long-duration benchmark files.

## 3.1.0

- Add the public `FitEncoder` API for writing FIT headers, definitions, data messages, and CRCs.
- Preserve the `course.sub_sport` field while parsing FIT course files.

<a name="1.5.4"></a>

## [1.5.4](https://github.com/jimmykane/fit-parser/compare/v1.0.0...v1.5.3) (2019-03-01)

- **Features**: HRV, Developer fields, devices and much more
- **Miscellaneous**: Fix most of the issues parsing fit files

<a name="1.0.1"></a>

## [1.0.1](https://github.com/pierremtb/easy-fit/compare/v1.0.0...v1.0.1) (2018-09-18)

### 😭 Unclassified (not [following convention](https://github.com/sportheroes/bk-conventional-changelog#types-of-commits))

- **Miscellaneous**: fix: Applied to src/fit offset adjustments from commit 9ed802 ([70b3eb6](https://github.com/pierremtb/easy-fit/commit/70b3eb6) - [JoeTheFkingFrypan](https://github.com/JoeTheFkingFrypan))

<a name="1.0.0"></a>

# [1.0.0](https://github.com/pierremtb/easy-fit/compare/0.0.7...1.0.0) (2018-09-17)

### 😭 Unclassified (not [following convention](https://github.com/sportheroes/bk-conventional-changelog#types-of-commits))

- **Miscellaneous**: Fix readme typo ([2282c06](https://github.com/pierremtb/easy-fit/commit/2282c06)))
- **Miscellaneous**: chore: preparing to release fork internally ([3eef5f7](https://github.com/pierremtb/easy-fit/commit/3eef5f7) - [JoeTheFkingFrypan](https://github.com/JoeTheFkingFrypan))
- **Miscellaneous**: fix: Typo leading to uint16 to never be invalidated ([9ed802c](https://github.com/pierremtb/easy-fit/commit/9ed802c) - [JoeTheFkingFrypan](https://github.com/JoeTheFkingFrypan))
- **Miscellaneous**: Merge remote-tracking branch 'jenglert/master' ([819d78e](https://github.com/pierremtb/easy-fit/commit/819d78e)))
- **Miscellaneous**: fix missing buffer dependency and compile dst ([a4b237a](https://github.com/pierremtb/easy-fit/commit/a4b237a)))
- **Miscellaneous**: Merge remote-tracking branch 'FrostDigital/master' ([6fa9258](https://github.com/pierremtb/easy-fit/commit/6fa9258)))
- **Miscellaneous**: Makes parsing of fit files with developer defined fields possible (#1) ([9aea666](https://github.com/pierremtb/easy-fit/commit/9aea666))), closes [#1](https://github.com/pierremtb/easy-fit/issues/1)
- **Miscellaneous**: fix: Adjusted offset for all altitude-related fields ([1ff0fa4](https://github.com/pierremtb/easy-fit/commit/1ff0fa4) - [JoeTheFkingFrypan](https://github.com/JoeTheFkingFrypan))
- **Miscellaneous**: chore(devices): add forerunner 735 xt ([aacaa04](https://github.com/pierremtb/easy-fit/commit/aacaa04)))
- **Miscellaneous**: Compile src ([ee4aa00](https://github.com/pierremtb/easy-fit/commit/ee4aa00)))
- **Miscellaneous**: Add support for other lap types ([dcf42a1](https://github.com/pierremtb/easy-fit/commit/dcf42a1)))
- **Miscellaneous**: Compile src ([50b9b21](https://github.com/pierremtb/easy-fit/commit/50b9b21)))
- **Miscellaneous**: Merge remote-tracking branch 'pierremtb/master' ([f7f5ff0](https://github.com/pierremtb/easy-fit/commit/f7f5ff0)))
- **Miscellaneous**: Add support for more manufacturers ([2d122d2](https://github.com/pierremtb/easy-fit/commit/2d122d2)))
- **Miscellaneous**: Really compiled last changes on binary.js this time, small details on package.json file -> bumped to 0.0.8 ([e5dc98f](https://github.com/pierremtb/easy-fit/commit/e5dc98f)))
