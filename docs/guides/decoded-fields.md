---
title: Understand decoded fields
summary: Interpret optional decoded values and use the maintained profile helpers.
---

The static profile supplies the message and field definitions used by the decoder
and the generated field reference. Pass `includeUnmappedMessages: true` to retain
fields outside that maintained surface by number and exact bytes; applications
that need all bytes for recognized messages can also opt into `raw_messages`.

Recognized message names, field names, enum values, wire types, scales,
offsets, arrays, and units come from the community-maintained profile in
`src/profile.ts` and `src/profile-lookup-data.ts`. Its maintenance and
verification contract is documented in
[profile maintenance](https://github.com/jimmykane/fit-parser/blob/main/PROFILE.md).

Public names use `snake_case` while preserving established alphanumeric tokens
such as `n2`, `po2`, and `time128`. Unmapped fields remain available by number
and exact bytes in `unmapped_messages` rather than receiving guessed names.

Only values present in the FIT input are emitted. In particular,
`product_name` is not inferred from `manufacturer` and `product`, and record
`elapsed_time` and `timer_time` are added only when `elapsedRecordField: true`
is requested. Parsed FIT timestamps are `Date` objects, FIT `bool` fields keep
their numeric wire values, mask fields decode to `{ value, ...flags }` objects,
unknown enum IDs remain numbers, and invalid entries retained inside FIT arrays
are `null`. All profile fields are optional because each FIT message definition
chooses which fields are present.

Applications that need profile lookups independently of parsing can use the
exported manufacturer, Garmin product, sport, sub-sport, and course-point helpers:

```javascript
import {
  getFitCoursePointId,
  getFitGarminProductDisplayName,
  getFitManufacturerName,
  getFitSportId,
  getFitSportName,
  getFitSubSportId,
  getFitSubSportName,
} from 'fit-file-parser'

getFitManufacturerName(1) // "garmin"
getFitGarminProductDisplayName(4655) // "Edge MTB"
getFitSportName(2) // "cycling"
getFitSubSportName(153) // "mountain_enduro"
getFitSportId('cycling') // 2
getFitSubSportId('indoor_cycling') // 6
getFitCoursePointId('rest_area') // 29
```

These helpers read the same maintained profile used by the decoder. The product
display helper is opt-in and does not synthesize or overwrite parsed
`product_name` values.

Lookup-only consumers can import the same helpers from
`fit-file-parser/profile` without loading the parser entry point.

## TypeScript access to nested fields

`ParsedFit` is a named export from the package root. The reference also shows its
nested field interfaces and enum types, but their source names are not all named
exports from the package. Derive nested types from the supported root type:

```typescript
import type { ParsedFit } from 'fit-file-parser'

type RecordSample = NonNullable<ParsedFit['records']>[number]
type SessionSummary = NonNullable<ParsedFit['sessions']>[number]
```

The field reference follows the maintained profile. Presence in the reference does
not establish that a particular watch exports that field; inspect the actual file.
Unknown fields can be retained through [raw and unmapped data](raw-data.md).
