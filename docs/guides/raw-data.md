---
title: Read raw and developer data
summary: Retain exact native and developer bytes or use the strict raw reader.
---

## Choose a representation

| API                                   | Returned representation                                     | Values                                            |
| ------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------- |
| `FitParser.parseAsync()`              | `records`, `sessions`, other decoded collections            | Profile names, converted units, `Date` timestamps |
| `FitParser` with `includeRawMessages` | `raw_messages`, snake_case metadata, plain `number[]` bytes | Wire bytes; no enum formatting or unit conversion |
| `readFitMessages()` from `/raw`       | `messages`, camelCase metadata, `Uint8Array` bytes          | Wire bytes and optional native FIT timestamps     |

The two raw representations have different shapes and are not interchangeable.
The `/raw` helpers below operate on `readFitMessages()` results.
Global message numbers identify message types, for example session `18`, lap `19`
and record `20`. Field numbers identify fields within that type, such as record
field `3` for heart rate. Look fields up by their number rather than array position;
producers choose field order.

For the following `FitParser` examples, start with this Node.js setup and run each
example separately:

```javascript
import { readFile } from 'node:fs/promises'
import FitParser from 'fit-file-parser'

const content = await readFile('./activity.fit')
```

## Lossless developer fields

FIT producers may define custom fields outside the standard profile. The
parser consumes every developer field's declared byte size so later messages
stay aligned. If a field description is not available yet, that value is
omitted. Subsequent values are decoded by name once the description appears.

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

Occurrence indexes restart for each file returned by `parseFilesAsync()`.

## Opt-in preservation of unmapped fields

Set `includeUnmappedMessages: true` to return fields that are absent from the
maintained profile or belong to an unknown global message in
`unmapped_messages`. Fields without usable developer names are also retained.
Normal known fields are not duplicated:

```javascript
const data = await new FitParser({ force: false, includeUnmappedMessages: true })
  .parseAsync(content)

for (const message of data.unmapped_messages ?? []) {
  console.log({
    globalMessageNumber: message.global_message_number,
    messageIndex: message.message_index,
    fields: message.fields,
    developerFields: message.developer_fields,
  })
}
```

Each entry uses the same wire-level field representation as `raw_messages`.
This opt-in ensures a newer FIT field cannot disappear merely because it
does not yet have a reviewed semantic mapping.

For record temperature encoded as one unsigned byte, values from 0 through
126 can be decoded as Celsius before the selected temperature conversion.
Values from 127 through 255 remain undecoded. This narrow interoperability
recovery preserves the original unsigned byte in `unmapped_messages` when
enabled, including values that also receive a decoded temperature.

## Battery samples

`batteries` retains every battery message in file order, including its
timestamp and capacity percentage when present. These samples are also
available in `messages.battery`. Undocumented battery fields remain available
through `includeUnmappedMessages`; the parser does not infer their device
association or calculate battery consumption.

## Exact bytes for selected messages

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

These messages preserve selected field bytes, not a byte-for-byte copy of the
whole FIT file. Keep the original file when exact file reproduction matters;
raw messages are not an input format for [the encoder](encoding.md).

The parser does not apply profile enum formatting, scaling, invalid-sentinel
filtering, or provider semantics to this opt-in representation. Its normal
decoded output remains unchanged. Pass `true` to retain every message or a
global-message-number array to limit which raw messages are retained. This
selection does not impose an input-size limit or skip walking the file. `raw_messages` and
`raw_developer_fields` are independent opt-ins; enabling `raw_messages` does
not add the flattened `raw_developer_fields` property. Set `rawMessagesOnly`
when only this representation is needed; the parser still validates and walks
the complete FIT data section but does not retain decoded activity collections.

`rawMessagesOnly` controls decoded-output retention; it does not enable a raw
collection by itself. Combine it with `includeRawMessages` or another raw
retention option. Enabling `includeRawMessages` also requires complete record
definitions and payloads throughout the file, including unselected messages.

## Lightweight raw messages

Consumers that need strict FIT framing, CRC validation, compressed timestamps,
and exact fields without loading the semantic profile can use the lightweight
raw entry point:

```javascript
import { readFile } from 'node:fs/promises'
import {
  fitTimestampToUnixMilliseconds,
  readFitMessages,
  readFitUnsignedField,
} from 'fit-file-parser/raw'

const content = await readFile('./activity.fit')
const { messages, issues } = readFitMessages(content, {
  messageNumbers: [20], // record messages
  maxInputBytes: 64 * 1024 * 1024,
})

for (const message of messages) {
  const heartRate = readFitUnsignedField(
    message.fields.find(field => field.fieldNumber === 3),
    0x02, // expected wire type: uint8
    1, // expected field width in bytes
    message.littleEndian,
  )
  const timestamp = message.timestamp === undefined
    ? undefined
    : new Date(fitTimestampToUnixMilliseconds(message.timestamp))
  console.log({ timestamp, heartRate })
}
if (issues.length > 0) {
  console.warn(issues)
}
```

Run this example independently of the `FitParser` setup. It loads the narrow raw
entry point. Native timestamps are seconds since the FIT epoch, not Unix seconds;
the conversion helper returns Unix milliseconds. The unsigned-field helper
checks width/type and invalid sentinels; it does not apply profile scales. Missing
fields and invalid sentinels return `undefined`; an incompatible field type throws.

The 64 MiB limit shown here is an example caller policy. There is no finite
`maxInputBytes` limit by default. Message selection limits retained messages;
the reader still walks the full input and validates framing and checksums.
It accepts exactly one complete FIT file; use `parseFilesAsync()` when decoding
concatenated files through the semantic parser.

The result retains native and developer fields as defensive `Uint8Array`
copies. It does not apply names, enum formatting, scales, units, or
provider-specific interpretation. Invalid input throws `FitMessageReaderError`
with a stable `code` such as `invalid_header`, `invalid_crc`, or
`invalid_structure`.

| Error code          | Meaning                                               |
| ------------------- | ----------------------------------------------------- |
| `invalid_input`     | Unsupported input or invalid reader options           |
| `input_limit`       | The caller's `maxInputBytes` limit was exceeded       |
| `invalid_header`    | Invalid header, protocol version or file length       |
| `invalid_crc`       | Header or file checksum mismatch                      |
| `invalid_structure` | Invalid message framing, definitions or record bounds |

Some timestamp-interpretation problems are reported as `invalid_timestamp`
entries in `issues`, while message bytes remain available. Inspect this list
when using timestamps; a returned result does not imply that every timestamp
could be interpreted. Issues can refer to unselected messages because the reader
still traverses the full input. These errors/issues are separate from the semantic
parser's record-position diagnostics described in [Handle errors](errors.md).
