# fit-file-parser

[![CI](https://github.com/jimmykane/fit-parser/actions/workflows/ci.yml/badge.svg)](https://github.com/jimmykane/fit-parser/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/fit-file-parser.svg)](https://www.npmjs.com/package/fit-file-parser)
[![license](https://img.shields.io/npm/l/fit-file-parser.svg)](./LICENSE)

Parse and encode FIT files in JavaScript and TypeScript. The parser supports
files produced by Garmin, Polar, Suunto, and other FIT-compatible devices,
including developer-defined data.

## Features

- Parse Node.js `Buffer` and standard `ArrayBuffer` inputs.
- Choose flat lists, nested activity data, or both output shapes.
- Convert speed, length, temperature, and pressure fields to preferred units.
- Decode developer fields while preserving record alignment when descriptions
  arrive after their definitions.
- Encode profile-agnostic FIT messages with validated field definitions and
  CRCs.
- Use ESM or CommonJS with bundled TypeScript declarations.

## Requirements

- Node.js 20 or newer

## Installation

```sh
npm install fit-file-parser
```

## Migrating from 4.x to 5.0

Version 5.0 is a breaking release because parsed output now follows the pinned
Garmin FIT SDK profile without compatibility aliases or guessed fields. Parser
construction, module imports, output modes, and parser options are unchanged.

Update field access, destructuring, persisted schemas, and snapshots to use the
SDK-backed names. Common migrations include:

| 4.x name                       | 5.0 name                     |
| ------------------------------ | ---------------------------- |
| `speed_1s`                     | `speed1s`                    |
| `start_n_2`, `end_n_2`         | `start_n2`, `end_n2`         |
| `o_2_toxicity`                 | `o2_toxicity`                |
| `avg_spo_2`, `reading_spo_2`   | `avg_spo2`, `reading_spo2`   |
| `po_2`                         | `po2`                        |
| `cycle_length_16`              | `cycle_length16`             |
| `map_3_sample_mean`            | `map3_sample_mean`           |
| `time_256`                     | `time256`                    |
| `last_night_5_min_high`        | `last_night5_min_high`       |
| `average_7_day_deviation`      | `average7_day_deviation`     |
| `spo_2_data`, `hsa_spo_2_data` | `spo2_data`, `hsa_spo2_data` |
| `repeat_dive_time`             | `repeat_dive_interval`       |
| `cadence_zone_high_boundary`   | `cadence_zone_high_bondary`  |
| `HipSwingExcerciseName`        | `HipSwingExerciseName`       |
| `resting_calories`             | `metabolic_calories`         |

The same alphanumeric-token rule applies to enum strings, for example
`camera_orientation_90` becomes `camera_orientation90`, `po_2_warn` becomes
`po2_warn`, and `power_3s` becomes `power3s`. The generated TypeScript
declarations are the exhaustive name and value reference for the pinned SDK.

Parser 4 exposed standard session field 196 (`metabolic_calories`) a second
time as `resting_calories`; use the canonical `metabolic_calories` name in 5.0.
`recovery_advisor` was a guessed label for standard session field 140, whose
canonical SDK field is `avg_depth` in meters. Other behavior to account for
during migration:

- `product_name` is emitted only when it exists in the FIT input. It is no
  longer inferred from `manufacturer` and `product`.
- Record `elapsed_time` and `timer_time` require
  `elapsedRecordField: true`.
- FIT timestamps are typed as `Date`, FIT `bool` values remain numeric, mask
  fields are `{ value, ...flags }` objects, unknown enum values remain numbers,
  and array entries may be `null` when the FIT invalid sentinel is retained.
- Every profile field is optional because individual FIT message definitions
  determine which fields are present.
- When upgrading from 4.1.0 or earlier, remove application-side scale or offset
  corrections for parsed numeric values, including dive depth, bottom time,
  ascent rate, and developer fields. The parser now applies the SDK metadata.

## Quick start

The Promise API is the simplest way to parse a file:

```javascript
import { readFile } from 'node:fs/promises'
import FitParser from 'fit-file-parser'

const content = await readFile('./activity.fit')
const parser = new FitParser({
  mode: 'list',
  speedUnit: 'km/h',
  lengthUnit: 'km',
})

const data = await parser.parseAsync(content)

console.log({
  sessions: data.sessions?.length ?? 0,
  laps: data.laps?.length ?? 0,
  records: data.records?.length ?? 0,
})
```

### Callback API

```javascript
import { readFile } from 'node:fs'
import FitParser from 'fit-file-parser'

readFile('./activity.fit', (readError, content) => {
  if (readError) {
    console.error(readError)
    return
  }

  const parser = new FitParser()
  parser.parse(content, (parseError, data) => {
    if (parseError) {
      console.error(parseError)
      return
    }

    console.log(data)
  })
})
```

Parser errors are strings. `parseAsync()` rejects with the same value that the
callback API receives as its first argument.

## Parser options

All options are optional.

| Option                      | Values                                  | Default   | Behavior                                                                                                                                       |
| --------------------------- | --------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`                      | `list`, `cascade`, `both`               | `list`    | Controls whether primary activity collections are returned as root lists, nested data, or both.                                                |
| `force`                     | `true`, `false`                         | `true`    | Skips header and file CRC validation and enables supported best-effort field recovery. Structural header and data bounds are always validated. |
| `speedUnit`                 | `m/s`, `km/h`, `mph`                    | `m/s`     | Converts speed-related fields.                                                                                                                 |
| `lengthUnit`                | `m`, `km`, `mi`                         | `m`       | Converts distance, altitude, and other length-related fields.                                                                                  |
| `temperatureUnit`           | `celsius`, `°C`, `kelvin`, `fahrenheit` | `celsius` | Converts temperature fields. `°C` remains available as a legacy alias.                                                                         |
| `pressureUnit`              | `bar`, `cbar`, `psi`                    | `bar`     | Converts pressure and tank-pressure fields.                                                                                                    |
| `elapsedRecordField`        | `true`, `false`                         | `false`   | Adds `elapsed_time` and `timer_time`, in seconds, to records.                                                                                  |
| `includeRawDeveloperFields` | `true`, `false`, message-number array   | `false`   | Adds a lossless, message-associated view of developer-field bytes at `raw_developer_fields`.                                                   |
| `includeRawMessages`        | `true`, `false`, message-number array   | `false`   | Adds selected FIT messages with exact native/developer bytes and wire metadata at `raw_messages`.                                              |
| `rawMessagesOnly`           | `true`, `false`                         | `false`   | Omits decoded activity collections when a consumer needs only the opt-in raw-message representation.                                           |

`force: true` does not make arbitrary bytes a valid FIT file. Inputs that are
too short, have an invalid header size or signature, or declare data beyond the
available bytes are rejected in both modes.

### Lossless developer fields

By default, developer fields retain the existing decoded, name-keyed output.
Set `includeRawDeveloperFields: true` when a consumer also needs exact field
bytes or must distinguish same-named fields from different developer-data
indexes:

```javascript
const data = await new FitParser({
  force: false,
  includeRawDeveloperFields: [18],
}).parseAsync(content)

for (const field of data.raw_developer_fields ?? []) {
  console.log({
    globalMessageNumber: field.global_message_number,
    messageIndex: field.message_index,
    developerDataIndex: field.developer_data_index,
    fieldDefinitionNumber: field.field_definition_number,
    rawBytes: field.raw_value,
  })
}
```

`message_index` is the zero-based occurrence of that global message number in
file order. `raw_value` is a defensive plain-number copy of the exact FIT field
bytes, including interior NUL bytes and invalid sentinels. Join
`developer_data_index` and `field_definition_number` to the existing
`developer_data_ids` and `field_descriptions` collections to interpret an
application and field. The parser deliberately does not infer application- or
provider-specific semantics. Pass `true` to retain developer fields from every
global message, or an array such as `[18]` to bound collection to specific FIT
message numbers.

### Lossless selected messages

Set `includeRawMessages` when a consumer needs native FIT numeric codes rather
than the parser's intentionally formatted enum names, or needs native and
developer fields grouped exactly by message occurrence:

```javascript
const data = await new FitParser({
  force: false,
  includeRawMessages: [18, 26, 72, 206, 207],
  rawMessagesOnly: true,
}).parseAsync(content)

for (const message of data.raw_messages ?? []) {
  console.log({
    globalMessageNumber: message.global_message_number,
    messageIndex: message.message_index,
    littleEndian: message.little_endian,
    fields: message.fields,
    developerFields: message.developer_fields,
  })
}
```

Each native field includes its field-definition number, wire base-type byte,
and a defensive plain-number copy of its exact bytes. Developer fields retain
their developer-data index, field-definition number, and exact bytes. Empty
selected messages are retained with empty field arrays. For a compressed
timestamp record, the timestamp is not present on the wire and therefore is
not invented in `fields`; its reconstructed native FIT timestamp is exposed as
`compressed_timestamp` instead.

The parser does not apply profile enum formatting, scaling, invalid-sentinel
filtering, or provider semantics to this opt-in representation. Its normal
decoded output remains unchanged. Pass `true` to retain every message or a
global-message-number array to keep memory use bounded. `raw_messages` and
`raw_developer_fields` are independent opt-ins; enabling `raw_messages` does
not add the flattened `raw_developer_fields` property. Set `rawMessagesOnly`
when only this representation is needed; the parser still validates and walks
the complete FIT data section but does not retain decoded activity collections.

## Output modes

The mode controls where sessions, laps, records, and related activity
collections are exposed.

| Mode      | Root lists | Nested under `activity` | Default |
| --------- | ---------- | ----------------------- | ------- |
| `list`    | Yes        | No                      | Yes     |
| `cascade` | No         | Yes                     | No      |
| `both`    | Yes        | Yes                     | No      |

In cascade output, sessions contain their laps and laps contain their records
and lengths. Other parsed FIT message collections remain available where the
parser exposes them.

Every recognized message is also retained in file order in `data.messages`.
This additive index is useful for message kinds that historically exposed
only the last value at the root:

```javascript
const workoutSteps = data.messages?.workout_step ?? []
const diveSummaries = data.messages?.dive_summary ?? []
```

Existing root lists, cascade nesting, and last-message root properties remain
unchanged.

## Profile-backed output

Standard message names, field names, enum values, wire types, scales, offsets,
arrays, and units come from the exactly pinned Garmin FIT SDK profile. Public
names use the parser's generated `snake_case` form while preserving SDK
alphanumeric tokens such as `n2`, `po2`, and `time128`. The parser does not add
compatibility aliases for alternate field spellings.

The small vendor extension table contains only Garmin fields and private
messages observed in the external FIT corpus. Extensions cannot replace a
standard SDK field or type value; the profile audit rejects collisions and
unregistered additions.

Only values present in the FIT input are emitted. In particular,
`product_name` is not inferred from `manufacturer` and `product`, and record
`elapsed_time` and `timer_time` are added only when `elapsedRecordField: true`
is requested. Parsed FIT timestamps are `Date` objects, FIT `bool` fields keep
their numeric wire values, mask fields decode to `{ value, ...flags }` objects,
unknown enum IDs remain numbers, and invalid entries retained inside FIT arrays
are `null`. All profile fields are optional because each FIT message definition
chooses which fields are present.

## Inputs

Both parser methods accept:

- Node.js `Buffer`
- `ArrayBuffer`

```javascript
const parsed = await new FitParser().parseAsync(arrayBuffer)
```

## Developer fields

FIT producers may define custom fields outside the standard profile. The
parser consumes every developer field's declared byte size so later messages
stay aligned. If a field description is not available yet, that value is
omitted. Subsequent values are decoded by name once the description appears.

## Encoding

`FitEncoder` writes FIT headers, message definitions, data messages, and CRCs.
It is profile-agnostic: callers provide profile message and field numbers,
base types, sizes, and values in their raw FIT representation. Applying FIT
scales and offsets is the caller's responsibility.

```javascript
import { FitBaseType, FitEncoder } from 'fit-file-parser'

const encoder = new FitEncoder()
encoder.writeMessage(0, [
  {
    number: 0,
    size: 1,
    baseType: FitBaseType.Enum,
    value: 6,
  },
  {
    number: 4,
    size: 4,
    baseType: FitBaseType.Uint32,
    value: FitEncoder.toFitTimestamp(new Date()),
  },
])

const fitBytes = encoder.close()
```

`writeMessage(globalMessageNumber, fields, localMessageNumber?)` accepts local
message numbers from 0 through 15. Definitions are emitted automatically and
reused until the shape assigned to that local number changes. `close()` returns
a `Uint8Array`.

The encoder also provides:

- `FitEncoder.string(value)` for null-terminated UTF-8 field bytes.
- `FitEncoder.toFitTimestamp(value)` for FIT timestamps.
- `FitEncoder.calculateCRC(bytes)` for FIT-compatible CRC calculation.

Scalar 64-bit values use `bigint`. Strings, numeric arrays, and other
variable-length values use exact-size `Uint8Array` values. Invalid field
definitions or numeric ranges throw before a partial message is written.

## TypeScript and module formats

The package includes TypeScript declarations and exports
`FitParserOptions`, `FitEncoderField`, and `FitEncoderOptions`.

ESM:

```javascript
import FitParser, { FitBaseType, FitEncoder } from 'fit-file-parser'
```

CommonJS:

```javascript
const {
  default: FitParser,
  FitBaseType,
  FitEncoder,
} = require('fit-file-parser')
```

## Development

Run commands from the repository root.

| Command                            | Purpose                                            |
| ---------------------------------- | -------------------------------------------------- |
| `npm ci`                           | Install locked dependencies.                       |
| `npm run build`                    | Build ESM and CommonJS output.                     |
| `npm test -- --run`                | Run the complete test suite once.                  |
| `npm test -- --run test/<file>.ts` | Run a focused test file.                           |
| `npm run codegen`                  | Regenerate the Garmin profile and public types.    |
| `npm run codegen:check`            | Verify both generated files are current.           |
| `npm run profile:audit`            | Audit SDK profile coverage and private overlays.   |
| `npm run corpus:check -- <path>`   | Validate an external FIT corpus without file data. |
| `npm run lint`                     | Check lint and formatting rules.                   |
| `npm run fmt`                      | Apply the configured formatting rules.             |
| `npm run type-check`               | Run TypeScript without emitting files.             |
| `npm run examples`                 | Build and regenerate checked-in example outputs.   |
| `npm run check`                    | Run profile audit, lint, types, tests, and builds. |

### External FIT corpus (optional)

The external corpus is not part of this repository or the npm package. For the
standard contributor layout, clone it alongside this checkout, then run the
aggregate-only validation command:

```sh
git clone https://github.com/ThomasKuehne/FIT-test-files.git ../FIT-test-files
npm run corpus:check -- ../FIT-test-files --allow-force-recovery
```

The command accepts any corpus path; the sibling location is only a convenient
convention. The corpus contains a known header-CRC failure that is expected to
recover only in force mode. It reports aggregate counts and never prints file
names or parsed activity data.

Do not edit `src/garmin_profile.generated.ts` or `src/fit_types.ts` manually.
Update the pinned SDK, audited vendor extensions, or a generator, then run
`npm run codegen`.

Repository-specific automation guidance is tracked in
[`.agent/README.md`](./.agent/README.md). More examples are available in the
[`examples`](./examples) directory, and release notes are in the
[`CHANGELOG`](./CHANGELOG.md).

## Contributors

This project started from work by
[Pierre Jacquier](https://github.com/pierremtb). Thanks to
[Mikael Lofjärd](https://github.com/mlofjard) for
[his early prototype](https://github.com/mlofjard/jsonfit), and to everyone in
[`CONTRIBUTORS.md`](./CONTRIBUTORS.md).

## License

MIT; see [`LICENSE`](./LICENSE).

Copyright 2019-present Dimitrios Kanellopoulos.
