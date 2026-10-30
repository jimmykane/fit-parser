---
title: Parse FIT files
summary: Read single or concatenated FIT inputs and choose the output shape.
---

## First parse in Node.js

Install with `npm install fit-file-parser` in your project. Node examples require
Node 20 or newer. Save the following as `parse.mjs`, place a FIT file at
`./activity.fit`, and run `node parse.mjs`:

```javascript
import { readFile } from 'node:fs/promises'
import FitParser from 'fit-file-parser'

const content = await readFile('./activity.fit')
const parser = new FitParser({
  force: false,
})

const data = await parser.parseAsync(content)

console.log({
  sessions: data.sessions?.length ?? 0,
  laps: data.laps?.length ?? 0,
  records: data.records?.length ?? 0,
})
```

This example checks CRCs while retaining the default compatible decoding policy.
The library default is `force: true`, which skips CRC checks. Choose deliberately
using [Configure parsing](options.md); `strict` is a separate structural policy.
Default output uses root lists, metres and metres per second.

## Inputs

The parser APIs accept:

- Node.js `Buffer`
- `ArrayBuffer`

Supply decompressed FIT bytes. Unpack gzip or ZIP containers before parsing.
Pass a Node `Buffer` directly so its byte offset and length are respected.
For another typed-array view, an exact copy avoids passing unrelated backing-buffer bytes:

```javascript
const arrayBuffer = Uint8Array.from(view).buffer
const parsed = await new FitParser({ force: false }).parseAsync(arrayBuffer)
```

## Browser file input

Use your application's bundler to resolve the npm import. A browser `File`
provides the `ArrayBuffer` expected by the parser:

```typescript
import FitParser from 'fit-file-parser'

export async function parseFitUpload(file: File) {
  const content = await file.arrayBuffer()
  return new FitParser({ force: false }).parseAsync(content)
}
```

The library uses the `buffer` package for string decoding. Browser builds must
resolve its browser implementation rather than externalize it as a Node builtin.

## Concatenated FIT files

Some exports append several complete FIT files into one input. Use
`parseFilesAsync()` to return a `ParsedFit[]` in file order:

```javascript
const files = await new FitParser({ force: false }).parseFilesAsync(content)
for (const file of files) {
  console.log(file.sessions?.length ?? 0)
}
```

Each result has independent message definitions, developer descriptions,
timestamps, and activity collections. Results are never merged. A single FIT
file returns a one-element array. All parsing APIs share the same `force` and
`strict` options. By default, complete fields in a partial final record can be
recovered, and a non-FIT suffix after parsed files is ignored. With `force: true`,
missing CRC bytes are also accepted, including when the next FIT header starts
at the declared data boundary or after one CRC byte. The parser never scans
record payloads for guessed file boundaries.

Use `{ force: false, strict: true }` to require complete files and records,
valid checksums, and no trailing bytes. `{ force: true, strict: true }` enforces
the same structure while skipping checksum validation. Any file that
cannot be parsed rejects the whole call with an `Error`. Empty input, invalid
headers, and declared data beyond the available input
remain errors in every mode.

The existing `parseAsync()` and callback APIs return the first FIT file only.
With `strict: true`, they require exactly one file; use `parseFilesAsync()` for
strict validation of concatenated input.

## Callback API

```javascript
import { readFile } from 'node:fs'
import FitParser from 'fit-file-parser'

readFile('./activity.fit', (readError, content) => {
  if (readError) {
    console.error(readError)
    return
  }

  const parser = new FitParser({ force: false })
  try {
    parser.parse(content, (parseError, data) => {
      if (parseError) {
        console.error(parseError)
        return
      }

      console.log(data)
    })
  }
  catch (decoderError) {
    console.error(decoderError)
  }
})
```

The callback reports validation errors as strings. `parseAsync()` rejects with
those values; decoder failures can reject with an `Error`. `parseFilesAsync()`
consistently rejects with an `Error`.

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

These collection descriptions apply to decoded output. `rawMessagesOnly: true`
omits decoded collections, including `messages`; see [Read raw and developer data](raw-data.md).
The `messages` object groups observations by message name; each array preserves
that name's file order. It is not one interleaved chronological list.
Use `raw_messages` or `readFitMessages()` when interleaved wire order matters.
These collections are alternate views of observations: choose one view for
aggregation instead of adding root lists, nested collections and `messages` together.

Activity, course and monitoring files can all contain valid FIT messages.
Inspect available `file_ids` metadata when your application needs a particular
file type; a successful decode alone does not establish that the input is a workout.

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

See [Configure parsing](options.md) for validation and unit options, and
[Handle errors](errors.md) for decoder exceptions.
