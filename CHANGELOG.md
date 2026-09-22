# Change Log

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
