# fit-file-parser

> Parse your .FIT files easily, directly from JS.
> Written in Typescript

## Install

```
$ npm install fit-file-parser --save
```

## How to use

See in [examples](./examples) folder:

### using callbacks

```javascript
import fs from 'node:fs/promises'
import FitParser from 'fit-file-parser'

fs.readFile('./example.fit', (err, content) => {
  // Create a FitParser instance (options argument is optional)
  if (err) {
    console.error(err)
  }
  const fitParser = new FitParser({
    force: true,
    speedUnit: 'km/h',
    lengthUnit: 'km',
    temperatureUnit: 'kelvin',
    pressureUnit: 'bar', // accept bar, cbar and psi (default is bar)
    elapsedRecordField: true,
    mode: 'cascade',
  })

  // Parse your file
  fitParser.parse(content, (error, data) => {
    // Handle result of parse method
    if (error) {
      console.error(error)
    }
    else {
      console.log(JSON.stringify(data))
    }
  })
})
```

### using async/await

```javascript
import fs from 'node:fs/promises'
import FitParser from 'fit-file-parser'

const buffer = await fs.readFile('./example.fit')
const fitObject = await fitParser.parseAsync(buffer)
```

## API Documentation

### new FitParser(Object _options_)

Needed to create a new instance. _options_ is optional, and is used to customize the returned object.

Allowed properties :

- `mode`: String
  - `cascade`: Returned object is organized as a tree, eg. each lap contains a `records` fields, that is an array of its records (**default**)
  - `list`: Returned object is organized as lists of sessions, laps, records, etc..., without parent-child relation
  - `both`: A mix of the two other modes, eg. `records` are available inside the root field as well as inside each laps
- `lengthUnit`: String
  - `m`: Lengths are in meters (**default**)
  - `km`: Lengths are in kilometers
  - `mi`: Lengths are in miles
- `temperatureUnit`: String
  - `celsius`:Temperatures are in °C (**default**)
  - `kelvin`: Temperatures are in °K
  - `fahrenheit`: Temperatures are in °F
- `speedUnit`: String
  - `m/s`: Speeds are in meters per seconds (**default**)
  - `km/h`: Speeds are in kilometers per hour
  - `mph`: Speeds are in miles per hour
- `force`: Boolean
  - `true`: Continues even if they are errors (**default for now**)
  - `false`: Stops if an error occurs
- `elapsedRecordField`: Boolean
  - `true`: Includes `elapsed_time`, containing the elapsed time in seconds since the first record, and `timer_time`, containing the time shown on the device, inside each `record` field
  - `false` (**default**)

### fitParser.parse(Buffer _file_, Function _callback_)

_callback_ receives two arguments, the first as a error String, and the second as Object, result of parsing.

### fitParser.parseAsync(Buffer _file_)

returns a Promise that resolves to the result of parsing.

## Contributors

All started thanks to [Pierre Jacquier](https://github.com/pierremtb)

Big thanks to [Mikael Lofjärd](https://github.com/mlofjard) for [his early prototype](https://github.com/mlofjard/jsonfit).
See [CONTRIBUTORS](./CONTRIBUTORS.md).

## License

MIT license; see [LICENSE](./LICENSE).

(c) 2019 Dimitrios Kanellopoulos
