Parse and encode FIT files in JavaScript and TypeScript, with ESM and CommonJS builds.
The API reference follows the package exports; the decoded field reference describes
nested values returned through `ParsedFit`.

## Start here

```sh
npm install fit-file-parser
```

Node.js examples require Node 20 or newer. Follow [Parse FIT files](guides/parsing.md)
for a runnable Node example, browser file input and CommonJS imports.

| Task                                                | Entry point                                |
| --------------------------------------------------- | ------------------------------------------ |
| Decode named fields, enums and timestamps           | Default `FitParser` from `fit-file-parser` |
| Encode explicitly defined FIT messages              | `fit-file-parser/encoder`                  |
| Look up manufacturer, product and sport identifiers | `fit-file-parser/profile`                  |
| Read strict wire-level messages and exact bytes     | `fit-file-parser/raw`                      |

The narrow entry points keep unrelated decoder/profile code out of that import.
Named helpers are also available from the package root.

## Guides

- [Parse FIT files](guides/parsing.md): inputs, async and callback APIs, concatenated files and output modes.
- [Configure parsing](guides/options.md): units, CRC checks, structural validation and compatibility behavior.
- [Handle errors](guides/errors.md): validation errors, decoder exceptions and record diagnostics.
- [Read raw and developer data](guides/raw-data.md): unmapped fields, selected messages and the strict raw reader.
- [Encode FIT files](guides/encoding.md): definitions, raw values, timestamps and CRCs.
- [Understand decoded fields](guides/decoded-fields.md): optional values, dates, enums and profile lookups.

## API and field reference

- {@link API.FitParser | FitParser}: the default package export, including
  {@link API.FitParser.parseAsync | parseAsync()},
  {@link API.FitParser.parseFilesAsync | parseFilesAsync()} and
  {@link API.FitParser.parse | parse()}.
- {@link API.FitParserOptions | FitParserOptions}: options for the semantic parser.
- {@link API.ParsedFit | ParsedFit}: decoded output and its optional message collections.
- {@link API.FitEncoder | FitEncoder}: the encoder, also available from `fit-file-parser/encoder`.
- {@link API.readFitMessages | readFitMessages}: the strict reader, also available from `fit-file-parser/raw`,
  with {@link API.readFitUnsignedField | readFitUnsignedField} and
  {@link API.fitTimestampToUnixMilliseconds | fitTimestampToUnixMilliseconds} for interpreting selected raw fields.
- {@link API.getFitManufacturerName | getFitManufacturerName}: profile lookup helpers, also available from `fit-file-parser/profile`.

The decoded field reference includes nested interfaces and enum types for navigation.
These names are not all named package exports. Use `ParsedFit` and indexed access types
as shown in [Understand decoded fields](guides/decoded-fields.md); do not import internal source paths.

Documentation is built from the repository source. See the
[GitHub repository](https://github.com/jimmykane/fit-parser) and
[npm package](https://www.npmjs.com/package/fit-file-parser) for releases.
