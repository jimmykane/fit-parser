import { describe, expect, it, vi } from 'vitest'
import FitParser, { FitBaseType, FitEncoder } from '../src/fit-parser.js'

function wrap(packets: number[]): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(14 + packets.length + 2)
  bytes[0] = 14
  bytes[1] = 32
  bytes.set([46, 70, 73, 84], 8)
  const view = new DataView(bytes.buffer)
  view.setUint32(4, packets.length, true)
  view.setUint16(12, FitEncoder.calculateCRC(bytes.subarray(0, 12)), true)
  bytes.set(packets, 14)
  view.setUint16(bytes.length - 2, FitEncoder.calculateCRC(bytes.subarray(0, -2)), true)
  return bytes
}

function concatenate(...files: Uint8Array[]): ArrayBuffer {
  const bytes = new Uint8Array(files.reduce((length, file) => length + file.length, 0))
  let offset = 0
  for (const file of files) {
    bytes.set(file, offset)
    offset += file.length
  }
  return bytes.buffer
}

function record(): Uint8Array<ArrayBuffer> {
  return new FitEncoder().writeMessage(20, [
    { number: 3, size: 1, baseType: FitBaseType.Uint8, value: 140 },
    { number: 13, size: 1, baseType: FitBaseType.Sint8, value: -10 },
  ]).close()
}

describe('shared force and strict policies', () => {
  it.each([false, true])('preserves legacy decoding of truncated native fields in both APIs with force=%s', async (force) => {
    // Complete heart rate, but the temperature is absent from the data section.
    const bytes = wrap([0x40, 0, 0, 20, 0, 2, 3, 1, 2, 13, 1, 2, 0, 140])
    // Default parsing must retain the existing decoder behavior, including
    // malformed input. Boundary validation requires explicit strict mode.
    bytes[bytes.length - 2] = 20
    if (!force) {
      new DataView(bytes.buffer).setUint16(bytes.length - 2, FitEncoder.calculateCRC(bytes.subarray(0, -2)), true)
    }
    const parser = new FitParser({ force, includeUnmappedMessages: true })
    const expected = await parser.parseAsync(bytes.buffer)
    expect(expected.records?.[0].heart_rate).toBe(140)
    expect(expected.records?.[0].temperature)
      .toBe(bytes[bytes.length - 2] < 127 ? bytes[bytes.length - 2] : undefined)
    expect(expected.unmapped_messages).toBeUndefined()
    expect(await parser.parseFilesAsync(bytes.buffer)).toEqual([expected])
    const callback = vi.fn()
    parser.parse(bytes.buffer, callback)
    expect(callback).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith(undefined, expected)
    expect(await parser.parseFilesAsync(concatenate(bytes, record())))
      .toEqual([expected, await parser.parseAsync(record().buffer)])
  })

  it.each([false, true])('recovers native fields before a truncated developer field with force=%s', async (force) => {
    const bytes = wrap([0x60, 0, 0, 20, 0, 1, 3, 1, 2, 1, 1, 4, 0, 0, 140, 1])
    const parser = new FitParser({ force, includeRawDeveloperFields: true, includeUnmappedMessages: true })
    const expected = await parser.parseAsync(bytes.buffer)
    expect(expected.records).toEqual([{ heart_rate: 140 }])
    expect(expected.raw_developer_fields).toEqual([])
    expect(expected.unmapped_messages).toBeUndefined()
    expect(await parser.parseFilesAsync(concatenate(bytes, record())))
      .toEqual([expected, await parser.parseAsync(record().buffer)])
  })

  it.each([false, true])('rejects truncated records in both APIs with strict=true and force=%s', async (force) => {
    const cases = [
      wrap([0x40, 0, 0, 20, 0, 1, 13, 1, 2, 0]),
      wrap([0x60, 0, 0, 20, 0, 1, 3, 1, 2, 1, 1, 4, 0, 0, 140, 1]),
    ]
    for (const bytes of cases) {
      const parser = new FitParser({ force, strict: true })
      await expect(parser.parseAsync(bytes.buffer)).rejects.toThrow('Invalid FIT data record bounds')
      await expect(parser.parseFilesAsync(bytes.buffer)).rejects.toThrow('Invalid FIT data record bounds')
    }
  })

  it.each([false, true])('preserves partial-file recovery at incomplete definitions with force=%s', async (force) => {
    const complete = record()
    const payload = Array.from(complete.subarray(complete[0], -2))
    const definitions = [
      [0x40, 0, 0], // Missing fixed definition header.
      [0x40, 0, 0, 20, 0, 1, 3], // Missing native size and base type.
      [0x60, 0, 0, 20, 0, 0], // Missing developer-field count.
      [0x60, 0, 0, 20, 0, 0, 1, 1], // Incomplete developer descriptor.
    ]
    const parser = new FitParser({ force })
    for (const prefix of [[], payload]) {
      const expected = await parser.parseAsync(wrap(prefix).buffer)
      for (const definition of definitions) {
        const bytes = wrap([...prefix, ...definition])
        expect(await parser.parseAsync(bytes.buffer)).toEqual(expected)
        expect(await parser.parseFilesAsync(bytes.buffer)).toEqual([expected])
        expect(await parser.parseFilesAsync(concatenate(bytes, complete)))
          .toEqual([expected, await parser.parseAsync(complete.buffer)])
        const callback = vi.fn()
        parser.parse(bytes.buffer, callback)
        expect(callback).toHaveBeenCalledOnce()
        expect(callback).toHaveBeenCalledWith(undefined, expected)
        const strict = new FitParser({ force, strict: true })
        await expect(strict.parseAsync(bytes.buffer)).rejects.toThrow(/Invalid FIT (developer )?definition/)
        await expect(strict.parseFilesAsync(bytes.buffer)).rejects.toThrow(/Invalid FIT (developer )?definition/)
      }
    }
  })

  it.each([false, true])('preserves the existing complete-record requirement for raw capture with force=%s', async (force) => {
    const parser = new FitParser({ force, includeRawMessages: true })
    const bytes = wrap([0x40, 0, 0])
    await expect(parser.parseAsync(bytes.buffer)).rejects.toThrow('Invalid FIT definition bounds')
    await expect(parser.parseFilesAsync(bytes.buffer)).rejects.toThrow('Invalid FIT definition bounds')
  })

  it.each([0, 1])('accepts %s CRC bytes only with force=true and strict=false in both APIs', async (crcBytes) => {
    const complete = record()
    const bytes = complete.slice(0, complete.length - 2 + crcBytes)
    const expected = await new FitParser({ force: false }).parseAsync(complete.buffer)
    expect(await new FitParser().parseAsync(bytes.buffer)).toEqual(expected)
    expect(await new FitParser().parseFilesAsync(bytes.buffer)).toEqual([expected])
    expect(await new FitParser().parseFilesAsync(concatenate(complete, bytes))).toEqual([expected, expected])
    expect(await new FitParser().parseFilesAsync(concatenate(bytes, complete))).toEqual([expected, expected])
    for (const options of [{ force: false }, { force: false, strict: true }, { force: true, strict: true }]) {
      const parser = new FitParser(options)
      await expect(parser.parseAsync(bytes.buffer)).rejects.toBe('File CRC missing')
      await expect(parser.parseFilesAsync(bytes.buffer)).rejects.toThrow('File CRC missing')
    }
  })

  it.each([false, true])('keeps CRC validation separate from structural strictness with strict=%s', async (strict) => {
    const complete = record()
    const expected = await new FitParser().parseAsync(complete.buffer)
    for (const index of [12, complete.length - 1]) {
      const bytes = complete.slice()
      bytes[index] ^= 0xFF
      const forced = new FitParser({ force: true, strict })
      expect(await forced.parseAsync(bytes.buffer)).toEqual(expected)
      expect(await forced.parseFilesAsync(bytes.buffer)).toEqual([expected])
      const checked = new FitParser({ force: false, strict })
      await expect(checked.parseAsync(bytes.buffer)).rejects.toMatch(/CRC mismatch/)
      await expect(checked.parseFilesAsync(bytes.buffer)).rejects.toThrow(/CRC mismatch/)
    }
  })

  it('uses the existing validation order when multiple file checks fail', async () => {
    const missingCrc = record().slice(0, -2)
    missingCrc[12] ^= 0xFF
    const missingData = record()
    new DataView(missingData.buffer).setUint32(4, 0xFFFFFFFF, true)
    const parser = new FitParser({ force: false })
    for (const bytes of [missingCrc, missingData]) {
      await expect(parser.parseAsync(bytes.buffer)).rejects.toBe('Header CRC mismatch')
      await expect(parser.parseFilesAsync(bytes.buffer)).rejects.toThrow('Header CRC mismatch')
    }
  })

  it.each([false, true])('ignores non-FIT suffixes only when strict=false with force=%s', async (force) => {
    const complete = record()
    const expected = await new FitParser({ force }).parseAsync(complete.buffer)
    for (const suffix of [new Uint8Array([0]), new Uint8Array(20)]) {
      const input = concatenate(complete, suffix)
      const parser = new FitParser({ force })
      expect(await parser.parseAsync(input)).toEqual(expected)
      expect(await parser.parseFilesAsync(input)).toEqual([expected])
      const strictParser = new FitParser({ force, strict: true })
      await expect(strictParser.parseAsync(input)).rejects.toBe('Unexpected bytes after FIT file')
      await expect(strictParser.parseFilesAsync(input)).rejects.toBeDefined()
    }
  })

  it('keeps the first-file return contract explicit in strict mode', async () => {
    const parser = new FitParser({ force: false, strict: true })
    const input = concatenate(record(), record())
    expect(await parser.parseFilesAsync(input)).toHaveLength(2)
    await expect(parser.parseAsync(input)).rejects.toBe('Unexpected bytes after FIT file')
  })

  it.each([false, true])('requires a compressed timestamp baseline in both strict APIs with force=%s', async (force) => {
    const bytes = wrap([0x40, 0, 0, 20, 0, 1, 3, 1, 2, 0x80, 140])
    const parser = new FitParser({ force, strict: true })
    await expect(parser.parseAsync(bytes.buffer)).rejects.toThrow('Compressed timestamp requires a previous timestamp')
    await expect(parser.parseFilesAsync(bytes.buffer)).rejects.toThrow('Compressed timestamp requires a previous timestamp')
    const recovery = new FitParser()
    expect((await recovery.parseAsync(bytes.buffer)).records).toEqual([{ heart_rate: 140 }])
    expect((await recovery.parseFilesAsync(bytes.buffer))[0].records).toEqual([{ heart_rate: 140 }])
  })

  it.each([false, true])('still rejects a FIT header declaring absent data with force=%s', async (force) => {
    const bytes = record().slice(0, -3)
    const parser = new FitParser({ force })
    await expect(parser.parseAsync(bytes.buffer)).rejects.toBe('File data exceeds input length')
    await expect(parser.parseFilesAsync(bytes.buffer)).rejects.toThrow('File data exceeds input length')
    await expect(parser.parseFilesAsync(concatenate(record(), bytes))).rejects.toThrow('File data exceeds input length')
  })
})
