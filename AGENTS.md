# Agent Instructions

## Garmin FIT SDK and profile changes

- Keep the official Garmin FIT SDK out of fit-parser, sports-lib, and Quantified Self, including their dependency
  trees and vendored code. This applies to development, tests, builds, and runtime. When needed for investigation,
  run it only as a standalone tool outside those repositories and their dependency trees.
- Do not copy, transcribe, or generate project mappings or test expectations from the SDK, its profile workbook,
  its headers, or its tool output. This includes tables republished by other libraries and old fit-parser releases
  that inherited those tables. Do not add scripts or CI jobs that fetch or synchronize them.
- For each new or changed mapping, record the independent source in the change description. Verify the field ID,
  name, scale, offset, units, or enum label being changed. Native FIT field definitions establish IDs and wire
  types. For names and conversions, use evidence such as a device export paired with a known setting or value.
  SDK-generated fixtures do not count as independent observations. Leave an unsupported addition out.
- Do not add SDK links, version references, or instructions to use the SDK to product docs, examples, source
  comments, tests, or release notes as part of routine changes. Preserve accurate provenance disclosures and
  required notices. Garmin device names, manufacturer IDs, and public API identifiers remain valid.
