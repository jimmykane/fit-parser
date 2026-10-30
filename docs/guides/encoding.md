---
title: Encode FIT files
summary: Write profile-agnostic FIT messages using explicit raw field values.
---

`FitEncoder` writes FIT headers, message definitions, data messages, and CRCs.
It is profile-agnostic: callers provide profile message and field numbers,
base types, sizes, and values in their raw FIT representation. Applying FIT
scales and offsets is the caller's responsibility.

For a profile field with a scale and offset, the decoded value is
`raw / scale - offset`. Reverse that conversion before encoding. For example,
record distance uses scale `100`: encode `100000` to represent 1,000 metres.
The parser's display-unit options are separate from these wire values.

```javascript
import { FitBaseType, FitEncoder } from 'fit-file-parser/encoder'

const encoder = new FitEncoder()
encoder.writeMessage(0, [
  {
    number: 0,
    size: 1,
    baseType: FitBaseType.Enum,
    value: 6, // file type: course
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

`protocolVersion` is the raw header byte, defaulting to `0x20` for FIT 2.0.
The major version occupies the high four bits, as defined in
[Garmin's FIT constants](https://github.com/garmin/fit-c-sdk/blob/main/example-sdk/fit.h),
so version 2.0 is `0x20`, not `2`.
Explicit values are written as supplied; for example, `0x10` writes a FIT 1.0 header.
This option does not validate whether the supplied messages and base types are
compatible with the selected protocol version.
Versions through 6.2.6 defaulted to `0x02`, which the semantic parser accepts but
`readFitMessages()` rejects. Regenerate exports to correct those old headers;
existing files are not rewritten by upgrading the package.

Continuing the example, decode the generated container through the public API:

```javascript
import FitParser from 'fit-file-parser'

const data = await new FitParser({ force: false, strict: true })
  .parseAsync(Uint8Array.from(fitBytes).buffer)
console.log(data.file_ids?.[0]?.type) // "course"
```

`writeMessage(globalMessageNumber, fields, localMessageNumber?)` accepts local
message numbers from 0 through 15. Definitions are emitted automatically and
reused until the shape assigned to that local number changes. `close()` returns
a `Uint8Array`.
The global number identifies the message type; the local number is a reusable
definition slot. They are separate identifiers.

The encoder also provides:

- `FitEncoder.string(value)` for null-terminated UTF-8 field bytes.
- `FitEncoder.toFitTimestamp(value)` for FIT timestamps.
- `FitEncoder.calculateCRC(bytes)` for FIT-compatible CRC calculation.

Scalar 64-bit values use `bigint`. Strings, numeric arrays, and other
variable-length values use exact-size `Uint8Array` values. Invalid field
definitions or numeric ranges throw before a partial message is written.

Encoding and semantic decoding have different coverage. In particular, the encoder
supports 64-bit integer values, while named semantic decoding does not currently
decode those integer fields. Preserve raw bytes for such values. A decoded
`ParsedFit` object is not an encoder input or a lossless copy of the source file.

The encoder remains available from the package root; the `/encoder` entry
point avoids loading the decoder and semantic profile.

The example writes a `file_id` message. Consumers producing a complete activity or
course must also supply the appropriate messages for that file type; the encoder
does not synthesize them.
