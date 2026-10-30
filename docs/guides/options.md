---
title: Configure parsing
summary: Choose units, checksum policy, structural checks and raw retention.
---

## Choose a validation policy

| Options                          | Policy                                                    |
| -------------------------------- | --------------------------------------------------------- |
| Default                          | Best effort, including missing or invalid CRCs.           |
| `{ force: false }`               | Validate CRCs while keeping existing field recovery.      |
| `{ force: true, strict: true }`  | Require complete structure while tolerating invalid CRCs. |
| `{ force: false, strict: true }` | Require complete structure and valid CRCs.                |

## Options

All options are optional.

| Option                      | Values                                  | Default   | Behavior                                                                                                                      |
| --------------------------- | --------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `mode`                      | `list`, `cascade`, `both`               | `list`    | Controls whether primary activity collections are returned as root lists, nested data, or both.                               |
| `force`                     | `true`, `false`                         | `true`    | Skips header and file CRC validation and enables supported recovery. Use `strict` for complete-record validation.             |
| `strict`                    | `true`, `false`                         | `false`   | Requires CRC bytes, complete records, valid definitions, and no trailing bytes. CRC validation remains controlled by `force`. |
| `speedUnit`                 | `m/s`, `km/h`, `mph`                    | `m/s`     | Converts speed-related fields.                                                                                                |
| `lengthUnit`                | `m`, `km`, `mi`                         | `m`       | Converts distance, altitude, and other length-related fields.                                                                 |
| `temperatureUnit`           | `celsius`, `°C`, `kelvin`, `fahrenheit` | `celsius` | Converts temperature fields. `°C` remains available as a legacy alias.                                                        |
| `pressureUnit`              | `bar`, `cbar`, `psi`                    | `bar`     | Converts pressure and tank-pressure fields.                                                                                   |
| `elapsedRecordField`        | `true`, `false`                         | `false`   | Adds `elapsed_time` and `timer_time`, in seconds, to records.                                                                 |
| `includeRawDeveloperFields` | `true`, `false`, message-number array   | `false`   | Adds a lossless, message-associated view of developer-field bytes at `raw_developer_fields`.                                  |
| `includeRawMessages`        | `true`, `false`, message-number array   | `false`   | Adds selected FIT messages with exact native/developer bytes and wire metadata at `raw_messages`.                             |
| `includeUnmappedMessages`   | `true`, `false`                         | `false`   | Retains unmapped native fields and unresolved developer fields by number and exact bytes in `unmapped_messages`.              |
| `rawMessagesOnly`           | `true`, `false`                         | `false`   | Omits decoded activity collections when a consumer needs only the opt-in raw-message representation.                          |

Use the exact unit strings listed above. Unrecognized unit names currently leave
values in their base units rather than raising a configuration error. Unit options
apply to converted field families; see [decoded values and units](decoded-fields.md#units-and-missing-values).

## Compatibility and recovery

`force: true` does not make arbitrary bytes a valid FIT file. Inputs that are
too short, have an invalid header size or signature, or declare data beyond the
available bytes are rejected in both modes.

`strict: false` keeps the existing decoder behavior, including its handling of
malformed records and definitions. `parseAsync()` and callback callers keep
their current defaults, recovery, and output. `parseFilesAsync()` uses that
same decoder independently for each file.

Ordinary decoding tolerates the reserved bit 4 in normal record headers used
by some existing device files. Messages using this compatibility behavior must
have complete definitions and payloads inside the declared data section. Bit 5
in data headers remains invalid. Strict mode, full raw-message retention, and
the standalone raw reader continue rejecting reserved header bits. Original
bytes and the caller's checksum policy are unchanged.

Numeric base-type IDs that omit the endian flag are decoded using the message
definition's byte order. Raw output retains the original type codes and bytes;
reserved/unknown codes and incompatible field types are not reinterpreted.
Previously affected files need to be parsed again to recover omitted fields.

`strict: true` adds definition and record bounds checks so CRC bytes cannot be
decoded as measurements. Enabling `includeRawMessages`, including a message-number selection, requires
complete definitions/records across the file and rejects reserved header bits.
This also applies to unselected messages. `includeRawDeveloperFields` and
`includeUnmappedMessages` keep the ordinary structural policy.

See [Handle errors](errors.md) for diagnostics and [Read raw and developer data](raw-data.md)
for the retention options.
