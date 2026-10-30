---
title: Handle errors
summary: Handle validation failures, decoder errors and their position diagnostics.
---

The APIs preserve their existing error contracts:

| API                 | File validation                             | Record decoder failures                 |
| ------------------- | ------------------------------------------- | --------------------------------------- |
| `parse()`           | Callback receives an error string.          | An `Error` can be thrown synchronously. |
| `parseAsync()`      | Promise rejects with the validation string. | Promise rejects with an `Error`.        |
| `parseFilesAsync()` | Promise rejects with an `Error`.            | Promise rejects with an `Error`.        |

Catch around the callback API call as well as handling its callback when accepting
untrusted files. A callback alone does not intercept a synchronous decoder exception.

## Record error diagnostics

Structural errors raised by the record decoder include `byteOffset`, the
zero-based position of the record header where decoding stopped, including the
FIT file header. This covers invalid data headers, invalid or incomplete
definitions, record bounds, missing local definitions and compressed timestamp
failures. The offset is relative to the supplied Buffer view or ArrayBuffer;
`parseFilesAsync()` also includes the preceding FIT files in that position.
These errors can be thrown synchronously by the callback API.

`recordHeader` contains the raw header byte (0–255), including its flag bits.
It is omitted when the attempted position is outside the FIT data section.
`FIT data record has no local definition` also retains `localMessageType`;
other errors do not add that property.

```javascript
try {
  await parser.parseAsync(content)
}
catch (error) {
  if (error instanceof Error && typeof error.byteOffset === 'number') {
    console.error(error.message, error.byteOffset, error.recordHeader)
  }
}
```

The stopping position can follow the malformed record that caused the
misalignment. These diagnostics do not identify the original cause or repair
the input. Existing error messages, validation and rejection behavior remain
unchanged.
File-level validation errors, such as CRC mismatches, keep their existing
representation and do not gain record diagnostics.

The independent `fit-file-parser/raw` reader has its own `FitMessageReaderError`
and stable `code` values. See [Read raw and developer data](raw-data.md).
