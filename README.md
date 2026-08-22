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

The same alphanumeric-token rule applies to enum strings, for example
`camera_orientation_90` becomes `camera_orientation90`, `po_2_warn` becomes
`po2_warn`, and `power_3s` becomes `power3s`. The generated TypeScript
declarations are the exhaustive name and value reference for the pinned SDK.

The handwritten `resting_calories` and guessed `recovery_advisor` fields have
no 5.0 replacement. Other behavior to account for during migration:

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

| Option               | Values                                  | Default   | Behavior                                                                                                                                       |
| -------------------- | --------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `mode`               | `list`, `cascade`, `both`               | `list`    | Controls whether primary activity collections are returned as root lists, nested data, or both.                                                |
| `force`              | `true`, `false`                         | `true`    | Skips header and file CRC validation and enables supported best-effort field recovery. Structural header and data bounds are always validated. |
| `speedUnit`          | `m/s`, `km/h`, `mph`                    | `m/s`     | Converts speed-related fields.                                                                                                                 |
| `lengthUnit`         | `m`, `km`, `mi`                         | `m`       | Converts distance, altitude, and other length-related fields.                                                                                  |
| `temperatureUnit`    | `celsius`, `°C`, `kelvin`, `fahrenheit` | `celsius` | Converts temperature fields. `°C` remains available as a legacy alias.                                                                         |
| `pressureUnit`       | `bar`, `cbar`, `psi`                    | `bar`     | Converts pressure and tank-pressure fields.                                                                                                    |
| `elapsedRecordField` | `true`, `false`                         | `false`   | Adds `elapsed_time` and `timer_time`, in seconds, to records.                                                                                  |

`force: true` does not make arbitrary bytes a valid FIT file. Inputs that are
too short, have an invalid header size or signature, or declare data beyond the
available bytes are rejected in both modes.

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
