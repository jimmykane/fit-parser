# Change Log

## 6.2.2 - 2026-10-11

### Fixed

- Restore ordinary decoding of existing Bryton and Magene FIT files whose
  normal record headers set reserved bit 4. Their activity data was readable
  before 5.2.0 and is recovered without modifying the original bytes.
- Require complete definitions and native/developer payloads for messages
  using reserved-header compatibility, including ordinary data records that
  reference a definition with the reserved bit set.

### Compatibility

- Strict parsing, full raw-message retention, and the standalone raw reader
  continue rejecting reserved header bits. Bit 5 in data headers remains
  invalid in all modes. Checksum behavior still follows `force`.
- No new options or parsed output fields. Existing successful imports need no
  migration; retry previously rejected originals with the updated parser.

## 6.2.1 - 2026-10-10

### Added

- Add the opt-in `strict` parser option to require complete files and records,
  valid definitions, and no trailing bytes in every parsing API. Checksum
  validation remains controlled by `force`.

### Fixed

- Apply the same recovery policy to `parseFilesAsync()`, `parseAsync()`, and
  callback parsing. The all-file API now accepts missing CRC bytes with
  `force: true` when `strict` is disabled, and ignores a non-FIT suffix.
- Keep existing decoder behavior, recovery, and output when `strict` is not
  requested, including handling of malformed records and definitions.
- Apply additional definition and record bounds checks only in strict mode.

### Compatibility

- `force` still defaults to `true`; `strict` defaults to `false`.
- `strict: true` requires exactly one file for `parseAsync()` and callback
  parsing, or complete concatenated files for `parseFilesAsync()`.
- Temperature mappings and unit conversions are unchanged.

## 6.2.0 - 2026-10-10

### Added

- Add `parseFilesAsync()` to return every complete FIT file in concatenated
  input as a separate result, with independent decoder state and file order.
- Decode documented session and lap swimming summaries, segment and gear-shift
  counts, lap bounds, metabolic calories, and grade-adjusted speed.
- Retain every battery sample in `batteries` and `messages.battery`, including
  timestamp and capacity percentage when present.
- Add `--all-files` to the external corpus checker to validate appended files.

### Fixed

- Preserve exact bytes for developer fields without usable names in opt-in
  `unmapped_messages`, including fields whose descriptions have been cached.
- Recover unsigned-byte record temperatures from 0 through 126 with normal
  unit conversion, while retaining their original bytes in opt-in output.
- Reject records and definitions extending beyond the declared data section
  when using the complete-file `parseFilesAsync()` API.

### Compatibility

- Existing `parseAsync()` and callback APIs retain their single-file output
  and recovery behavior. Newly supported fields and battery collections are
  additive.
- `parseFilesAsync()` returns a one-element array for ordinary FIT input and
  rejects incomplete files or trailing non-FIT data, even with `force: true`.
  CRC validation follows the caller's `force` option for every file.
- Unsigned temperature bytes from 127 through 255 and other undocumented or
  incompatible fields remain undecoded and available through opt-in retention.

## 6.1.2 - 2026-09-22

### Changed

- Keep the manufacturer, Garmin product, sport, sub-sport, and course-point
  lookup maps in one authoritative internal module shared by the full decoder
  profile and the lightweight `fit-file-parser/profile` entry point.
- Prevent lookup-only consumers from loading the full decoder profile and its
  message definitions.
- Enforce the lookup entry point's dependency graph and a 25 KB minified bundle
  ceiling in the profile checks run by CI.

### Compatibility

- Profile mappings, parsed output, and the public TypeScript API are unchanged.

## 6.1.1 - 2026-09-21

### Added

- Export lookup helpers for FIT manufacturer, Garmin product, sport, and
  sub-sport identifiers from the package root.
- Export the same helpers from the lightweight `fit-file-parser/profile`
  entry point for lookup-only consumers.
- Add reverse sport, sub-sport, and course-point identifier lookups.
- Add lightweight `fit-file-parser/raw` and `fit-file-parser/encoder` entry
  points for profile-independent message scanning and encoding.
- Add a strict raw-message reader with CRC, definition, developer-field, and
  compressed-timestamp validation.
- Export an opt-in Garmin product display-name helper without changing parsed
  `product` or `product_name` fields.
- Decode mountain enduro and mountain downhill sub-sport identifiers.

### Compatibility

- Existing parsed output remains unchanged except that sub-sport IDs 153 and
  154 now resolve to `mountain_enduro` and `mountain_downhill`.
- Existing Garmin product display names ported from SportsLib are preserved.

## 6.0.2 - 2026-09-21

### Changed

- Consolidate the complete message, field, wire-metadata, type, enum, and
  product contract into one static maintained profile.
- Maintain the FIT interoperability profile directly as static project source.
- Preserve decoded output and the public TypeScript surface.

### Added

- Add opt-in `unmapped_messages` preservation, including exact bytes and
  definition metadata, without changing default parsed output.
- Add regression coverage for unknown messages, unknown fields inside known
  messages, the immutable compatibility profile, and default-output stability.
- Add an optional privacy-safe corpus summary for unmapped message/field IDs,
  wire base types, sizes, occurrences, and file counts.
- Document the manual update requirements and corpus verification workflow in
  `PROFILE.md`.

There are no intentional parsed-output or public API changes in this release.
Output parity was verified across 162 checked-in fixture/mode combinations,
8,320 generated malformed endian-definition cases, and both private
long-duration benchmark files.
