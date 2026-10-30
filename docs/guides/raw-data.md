---
title: Read raw and developer data
summary: Retain exact native and developer bytes or use the strict raw reader.
---

FIT producers may define custom fields outside the standard profile. The
parser consumes every developer field's declared byte size so later messages
stay aligned. If a field description is not available yet, that value is
omitted. Subsequent values are decoded by name once the description appears.

## Lossless developer fields

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

## Opt-in preservation of unmapped fields

Set `includeUnmappedMessages: true` to return fields that are absent from the
maintained profile or belong to an unknown global message in
`unmapped_messages`. Fields without usable developer names are also retained.
Normal known fields are not duplicated:

```javascript
const data = await new FitParser({ includeUnmappedMessages: true })
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

## Lossless selected messages

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

## Lightweight raw messages

Consumers that need strict FIT framing, CRC validation, compressed timestamps,
and exact fields without loading the semantic profile can use the lightweight
raw entry point:

```javascript
import { readFitMessages } from 'fit-file-parser/raw'

const { messages } = readFitMessages(content, {
  messageNumbers: [18, 26, 72],
  maxInputBytes: 64 * 1024 * 1024,
})
```

The result retains native and developer fields as defensive `Uint8Array`
copies. It does not apply names, enum formatting, scales, units, or
provider-specific interpretation. Invalid input throws `FitMessageReaderError`
with a stable `code` such as `invalid_header`, `invalid_crc`, or
`invalid_structure`.
