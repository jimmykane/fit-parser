import type { FitParserOptions } from '../src/fit-parser.js'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { FitEncoder } from '../src/fit-encoder.js'

// Run with FIT_PARSER_TEST_BUILDS=1 after npm run build to cover package exports too.
const entries = process.env.FIT_PARSER_TEST_BUILDS === '1'
  ? ['src', 'dist', 'dist/cjs']
  : ['src']
const reportedFixture = Buffer.from(
  'DiBcCE8AAAAuRklUfEtAAADOAAQAAQIBAQICAQIDGAcAAAcHZGV2ZWxvcGVyX2RhdGFfaW5kZXgAAAAAYQAAzgADAQECAgECAwECAQcKAAEJBwFfX3Byb3RvX18AGYA=',
  'base64',
)

function wrap(packets: number[]): Buffer<ArrayBuffer> {
  const bytes = Buffer.alloc(14 + packets.length + 2)
  bytes[0] = 14
  bytes[1] = 32
  bytes.set([46, 70, 73, 84], 8)
  bytes.writeUInt32LE(packets.length, 4)
  bytes.writeUInt16LE(FitEncoder.calculateCRC(bytes.subarray(0, 12)), 12)
  bytes.set(packets, 14)
  bytes.writeUInt16LE(FitEncoder.calculateCRC(bytes.subarray(0, -2)), bytes.length - 2)
  return bytes
}

function text(value: string): number[] {
  return Array.from(Buffer.from(`${value}\0`))
}

function description(index: number, number: number, baseType: number, name: string): number[] {
  const nameBytes = text(name)
  return [
    ...[0x40, 0, 0, 206, 0, 4],
    ...[0, 1, 2, 1, 1, 2, 2, 1, 2, 3, nameBytes.length, 7],
    ...[0, index, number, baseType, ...nameBytes],
  ]
}

function overwrittenDescription(
  key: string,
  baseType: number,
  value: number[],
): Buffer<ArrayBuffer> {
  const name = text('untrusted_value')
  return wrap([
    ...description(0, 0, baseType, key),
    ...[0x61, 0, 0, 206, 0, 4],
    ...[0, 1, 2, 1, 1, 2, 2, 1, 2, 3, name.length, 7],
    ...[1, 0, value.length, 0],
    ...[1, 0, 9, 7, ...name, ...value],
  ])
}

function float64(value: number): number[] {
  const bytes = Buffer.alloc(8)
  bytes.writeDoubleLE(value)
  return Array.from(bytes)
}

function normalFields(index: number, number: number): Buffer<ArrayBuffer> {
  return wrap([
    ...description(index, number, 132, 'custom_value'),
    ...[0x61, 0, 0, 20, 0, 1, 3, 1, 2, 1, number, 2, index],
    ...[1, 140, 0xD2, 4],
    ...[1, 141, 0xD3, 4],
  ])
}

// A vulnerable parser must never run in the Vitest process. Snapshot shared
// objects even if parsing throws: a later error does not undo prototype writes.
const childScript = `
import { Buffer } from 'node:buffer'
import { readFileSync } from 'node:fs'
import process from 'node:process'
import { isDeepStrictEqual } from 'node:util'
const job = JSON.parse(readFileSync(0, 'utf8'))
const module = await import(job.parser)
const FitParser = typeof module.default === 'function' ? module.default : module.default.default
const { readRecord } = await import(job.binary)
const targets = [Array, Array.prototype, Object.prototype, Function.prototype]
const before = targets.map(target => ({
  prototype: Object.getPrototypeOf(target),
  descriptors: Object.getOwnPropertyDescriptors(target),
}))
const input = Buffer.from(job.bytes, 'base64')
const original = Buffer.from(input)
let content = input
const developerFields = []
let result
let error = null
try {
  if (job.api === 'decoder') {
    const messageTypes = []
    const state = {}
    const view = new DataView(input.buffer, input.byteOffset, input.length)
    const end = input[0] + input.readUInt32LE(4)
    let offset = input[0]
    while (offset < end) {
      const record = readRecord(input, messageTypes, developerFields, offset,
        job.options, undefined, 0, view, state, end)
      offset = record.nextIndex
      result = record.message
    }
  } else {
    const parser = new FitParser(job.options)
    content = job.arrayBuffer
      ? Uint8Array.from(input).buffer
      : Buffer.concat([Buffer.alloc(5), input, Buffer.alloc(3)]).subarray(5, input.length + 5)
    if (job.api === 'callback') {
      parser.parse(content, (failure, value) => {
        if (failure) throw failure
        result = value
      })
    } else if (job.api === 'files') {
      result = (await parser.parseFilesAsync(content))[0]
    } else {
      result = await parser.parseAsync(content)
    }
  }
} catch (failure) {
  error = String(failure)
}
const sharedObjectsUnchanged = targets.every((target, index) =>
  Object.getPrototypeOf(target) === before[index].prototype
  && isDeepStrictEqual(Object.getOwnPropertyDescriptors(target), before[index].descriptors))
const cache = Object.fromEntries(Object.keys(developerFields).map(index => [
  index,
  Object.fromEntries(Object.keys(developerFields[index]).map(number => [
    number, developerFields[index][number].field_name,
  ])),
]))
const cachePrototypesUnchanged = Object.getPrototypeOf(developerFields) === Array.prototype
  && Object.keys(developerFields).every(index =>
    Array.isArray(developerFields[index])
    && Object.getPrototypeOf(developerFields[index]) === Array.prototype)
process.stdout.write(JSON.stringify({
  error, result, sharedObjectsUnchanged, cache, cachePrototypesUnchanged,
  inputUnchanged: Buffer.from(content instanceof ArrayBuffer ? new Uint8Array(content) : content).equals(original),
}))
`

function exercise(
  entry: string,
  bytes: Buffer,
  api = 'decoder',
  options: FitParserOptions = { force: false },
  arrayBuffer = false,
): any {
  const extension = entry === 'src' ? 'ts' : 'js'
  const child = spawnSync(process.execPath, [
    ...(entry === 'src' ? ['--import', 'tsx'] : []),
    '--input-type=module',
    '--eval',
    childScript,
  ], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    input: JSON.stringify({
      parser: new URL(`../${entry}/fit-parser.${extension}`, import.meta.url).href,
      binary: new URL(`../${entry}/binary.${extension}`, import.meta.url).href,
      bytes: bytes.toString('base64'),
      api,
      options,
      arrayBuffer,
    }),
    encoding: 'utf8',
    timeout: 10_000,
  })
  expect(child.error).toBeUndefined()
  expect(child.status, child.stderr).toBe(0)
  return JSON.parse(child.stdout)
}

const modes: FitParserOptions[] = [
  {},
  { force: false, mode: 'list' },
  { force: true, mode: 'cascade' },
  { force: false, strict: true, mode: 'both' },
  { force: true, strict: true },
  { force: false, includeRawMessages: [206], rawMessagesOnly: true },
  { force: false, includeRawMessages: [20], rawMessagesOnly: true },
  { force: false, includeRawDeveloperFields: true, includeUnmappedMessages: true },
]

const invalidValues = [
  { name: 'prototype accessor', baseType: 7, value: text('__proto__') },
  { name: 'constructor', baseType: 7, value: text('constructor') },
  { name: 'inherited method', baseType: 7, value: text('map') },
  { name: 'NUL-normalized accessor', baseType: 7, value: text('__pro\0to__') },
  { name: 'numeric string', baseType: 7, value: text('9') },
  { name: 'numeric array', baseType: 2, value: [0, 1] },
  { name: 'negative number', baseType: 137, value: float64(-1) },
  { name: 'fraction', baseType: 137, value: float64(0.5) },
  { name: 'out-of-range number', baseType: 137, value: float64(256) },
]

describe.each(entries)('%s developer-field metadata safety', (entry) => {
  it.each(modes)('keeps the reported CRC-valid file harmless with options %j', (options) => {
    for (const api of ['callback', 'async', 'files', 'decoder']) {
      const observed = exercise(entry, reportedFixture, api, options, api === 'async')
      expect(observed.sharedObjectsUnchanged, api).toBe(true)
      expect(observed.cachePrototypesUnchanged, api).toBe(true)
      expect(observed.inputUnchanged, api).toBe(true)
    }
  }, 15_000)

  it.each(['developer_data_index', 'field_definition_number'])('does not coerce invalid %s cache keys', (key) => {
    for (const { name, baseType, value } of invalidValues) {
      const bytes = overwrittenDescription(key, baseType, value)
      const observed = exercise(entry, bytes)
      expect(observed.error, name).toBeNull()
      expect(observed.sharedObjectsUnchanged, name).toBe(true)
      expect(observed.cachePrototypesUnchanged, name).toBe(true)
      expect(observed.cache, name).toEqual({ 0: { 0: key } })
      expect(observed.result[key], name).toBeDefined()
      expect(observed.inputUnchanged, name).toBe(true)
    }
  }, 15_000)

  it('does not register descriptions with missing identities', () => {
    const observed = exercise(entry, wrap([0x40, 0, 0, 206, 0, 0, 0]))
    expect(observed.error).toBeNull()
    expect(observed.cache).toEqual({})
    expect(observed.sharedObjectsUnchanged).toBe(true)
  })

  it('preserves raw developer bytes when invalid descriptions are not registered', () => {
    const observed = exercise(entry, reportedFixture, 'async', {
      force: false,
      strict: true,
      includeRawMessages: [206],
      rawMessagesOnly: true,
    })
    expect(observed.error).toBeNull()
    expect(observed.result.raw_messages).toHaveLength(2)
    expect(observed.result.raw_messages[1].developer_fields).toEqual([{
      developer_data_index: 0,
      field_definition_number: 7,
      raw_value: text('__proto__'),
    }])
    expect(observed.sharedObjectsUnchanged).toBe(true)
  })

  it('protects concatenated inputs after an ordinary file', () => {
    const observed = exercise(entry, Buffer.concat([normalFields(0, 0), reportedFixture]), 'files')
    expect(observed.error).toBeNull()
    expect(observed.result.records).toMatchObject([{ custom_value: 1234 }, { custom_value: 1235 }])
    expect(observed.sharedObjectsUnchanged).toBe(true)
  })

  it('leaves shared objects intact when a later record fails', () => {
    const bytes = wrap([...reportedFixture.subarray(14, -2), 0x20])
    const observed = exercise(entry, bytes, 'async')
    expect(observed.error).toContain('Invalid FIT data record header')
    expect(observed.sharedObjectsUnchanged).toBe(true)
    expect(observed.inputUnchanged).toBe(true)
  })

  it.each([[0, 0], [254, 254]])('still decodes ordinary developer index %i field %i', (index, number) => {
    const observed = exercise(entry, normalFields(index, number), 'async', {
      force: false,
      strict: true,
      mode: 'list',
      includeRawMessages: [20],
      includeRawDeveloperFields: true,
    })
    expect(observed.error).toBeNull()
    expect(observed.result.records).toMatchObject([
      { heart_rate: 140, custom_value: 1234 },
      { heart_rate: 141, custom_value: 1235 },
    ])
    expect(observed.result.raw_developer_fields).toMatchObject([
      { developer_data_index: index, field_definition_number: number, raw_value: [0xD2, 4] },
      { developer_data_index: index, field_definition_number: number, raw_value: [0xD3, 4] },
    ])
    expect(observed.sharedObjectsUnchanged).toBe(true)
    expect(observed.inputUnchanged).toBe(true)
  })
})
