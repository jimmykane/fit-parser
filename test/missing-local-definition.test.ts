import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import FitParser, { FitBaseType, FitEncoder } from '../src/fit-parser.js'

const message = 'FIT data record has no local definition'
// CRC-valid synthetic reproductions supplied in issue #64; no activity data.
const simple = 'DhAVCBMAAAAuRklUVNlBAAAUAAH9BIYBAMqaOwXerb7vhkk='
const pauseOverrun = 'DhBcCJgBAAAuRklU3zFNAAEAAAUAAQABAoQCAoQDBIwEBIYNBAABBscAEtaHRH/h8EEAAQAUCf0EhgAEhQEEhQIChAUEhgMBAgQBAgcChA0BAUkAAQAVA/0EhgABAAEBAAFEf+HwHmoKeAc/CGsMHAAAAAB4UACWHwFEf+H6HmorFwc/KQsMRAAAJxB4UACWHwFEf+IEHmpLtgc/SaoMbAAATiB4UACWHwlEf+IOAAQJRH/iDgAAAUR/4g4eamxWBz9qSQyUAAB1MHhQ////HwFEf+IYHmqM9Qc/iukMvAAAnEB4UACWHwFEf+IiHmqtlAc/q4gM5AAAw1B4UACWH0IAAQATCP4ChP0EhgIEhgcEhggEhgkEhgABAAEBAAIAAER/4iJEf+HwAADDUAAAw1AAAAAACQFDAAEAEgz+AoT9BIYCBIYHBIYIBIYJBIYFAQAGAQAZAoQaAoQAAQABAQADAABEf+IiRH/h8AAAw1AAAMNQAAAAAAIHAAAAAQgBRAABACIG/QSGAASGAQKEAgEAAwEABAEABER/4iIAAMNQAAEAGgHAcg=='

function overrunAtTemperature(temperature: number): Buffer<ArrayBuffer> {
  const bytes = Buffer.from(pauseOverrun, 'base64')
  for (const offset of [120, 144, 168, 207, 231, 255]) {
    expect(bytes[offset]).toBe(31)
    bytes[offset] = temperature
  }
  bytes.writeUInt16LE(FitEncoder.calculateCRC(bytes.subarray(0, -2)), bytes.length - 2)
  return bytes
}

function validFile(): Uint8Array<ArrayBuffer> {
  return new FitEncoder().writeMessage(20, [
    { number: 3, size: 1, baseType: FitBaseType.Uint8, value: 120 },
  ]).close()
}

describe.each([
  ['simple undefined slot', () => Buffer.from(simple, 'base64'), 28, 5, 0x05],
  ['big-endian pause overrun', () => Buffer.from(pauseOverrun, 'base64'), 207, 15, 0x1F],
  ['delayed failure after an overrun', () => overrunAtTemperature(1), 279, 0, 0x86],
] as const)('missing local definition: %s', (_name, input, byteOffset, localMessageType, recordHeader) => {
  it.each([false, true])('rejects async parsing with diagnostics and force=%s', async (force) => {
    const bytes = input()
    const before = Buffer.from(bytes)
    await expect(new FitParser({ force }).parseAsync(bytes)).rejects.toMatchObject({
      message,
      byteOffset,
      localMessageType,
      recordHeader,
    })
    expect(bytes).toEqual(before)
  })

  it('preserves the synchronous decoder error from the callback API', () => {
    const callback = vi.fn()
    let failure: unknown
    try {
      new FitParser({ force: false }).parse(input(), callback)
    }
    catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject({ message, byteOffset, localMessageType, recordHeader })
    expect(callback).not.toHaveBeenCalled()
  })

  it('reports offsets relative to a supplied Buffer view', async () => {
    const bytes = input()
    const padded = Buffer.concat([Buffer.alloc(17), bytes, Buffer.alloc(11)])
    const view = padded.subarray(17, 17 + bytes.length)
    await expect(new FitParser({ force: false }).parseAsync(view)).rejects.toMatchObject({
      message,
      byteOffset,
      localMessageType,
      recordHeader,
    })
  })

  it('preserves diagnostics for a single file through the all-file API', async () => {
    await expect(new FitParser({ force: false }).parseFilesAsync(input())).rejects.toMatchObject({
      message,
      byteOffset,
      localMessageType,
      recordHeader,
    })
  })

  it.each([1, 2])('includes %i preceding FIT files in the all-file offset', async (count) => {
    const prefixes = Array.from({ length: count }, () => validFile())
    const prefixSize = prefixes.reduce((sum, bytes) => sum + bytes.length, 0)
    const joined = Buffer.concat([...prefixes, input()])
    const padded = Buffer.concat([Buffer.alloc(13), joined, Buffer.alloc(7)])
    await expect(new FitParser({ force: false }).parseFilesAsync(
      padded.subarray(13, 13 + joined.length),
    )).rejects.toMatchObject({ message, byteOffset: prefixSize + byteOffset, localMessageType, recordHeader })
  })
})

describe('missing local definition validation boundaries', () => {
  it.each([1, 2])('uses the actual preceding file length when %i CRC bytes are missing', async (missing) => {
    const first = validFile()
    const prefix = first.subarray(0, first.length - missing)
    const bytes = Buffer.concat([prefix, Buffer.from(simple, 'base64')])
    await expect(new FitParser({ force: true }).parseFilesAsync(bytes)).rejects.toMatchObject({
      message,
      byteOffset: prefix.length + 28,
      localMessageType: 5,
    })
  })

  it('includes diagnostics in strict decoding when the header is valid', async () => {
    await expect(new FitParser({ force: false, strict: true }).parseAsync(
      Buffer.from(simple, 'base64'),
    )).rejects.toMatchObject({ message, byteOffset: 28, localMessageType: 5 })
  })

  it('keeps strict reserved-header rejection ahead of the definition lookup', async () => {
    const failure = await new FitParser({ force: false, strict: true })
      .parseAsync(Buffer.from(pauseOverrun, 'base64'))
      .catch(error => error)
    expect(failure).toMatchObject({ message: 'Invalid FIT data record header', byteOffset: 207, recordHeader: 0x1F })
    expect(failure).not.toHaveProperty('localMessageType')
  })

  it.each([false, true])('reports the 33°C overrun header with force=%s', async (force) => {
    const bytes = overrunAtTemperature(33)
    const before = Buffer.from(bytes)
    const expected = { message: 'Invalid FIT data record header', byteOffset: 207, recordHeader: 0x21 }
    const parser = new FitParser({ force })
    await expect(parser.parseAsync(bytes)).rejects.toMatchObject(expected)
    const prefix = validFile()
    await expect(parser.parseFilesAsync(Buffer.concat([prefix, bytes]))).rejects.toMatchObject({
      ...expected,
      byteOffset: prefix.length + 207,
    })
    expect(bytes).toEqual(before)
  })

  it('preserves checksum validation before decoding', async () => {
    const bytes = Buffer.from(pauseOverrun, 'base64')
    bytes[bytes.length - 1] ^= 1
    await expect(new FitParser({ force: false }).parseAsync(bytes)).rejects.toBe('File CRC mismatch')
  })
})
