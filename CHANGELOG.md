# Change Log

## 6.0.1 - 2026-09-21

### Changed

- Consolidate the complete message, field, wire-metadata, type, enum, and
  product contract into one static maintained profile.
- Use one static maintained profile table.
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
