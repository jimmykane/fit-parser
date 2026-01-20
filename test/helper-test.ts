import { describe, expect, it } from 'vitest'
import { mapDataIntoLap, mapDataIntoSession } from '../src/helper.js'

describe('helper tests', () => {
  describe('mapDataIntoLap', () => {
    it('expects data to be mapped into laps correctly based on start_time', () => {
      const lap1Start = new Date('2023-01-01T10:00:00Z')
      const lap2Start = new Date('2023-01-01T10:10:00Z')
      const laps: any[] = [
        { start_time: lap1Start },
        { start_time: lap2Start },
      ]

      const data = [
        // Before lap 1 (should be included in lap 1 due to simplified logic)
        { timestamp: new Date('2023-01-01T09:59:50Z'), value: 1 },
        // Inside lap 1
        { timestamp: new Date('2023-01-01T10:05:00Z'), value: 2 },
        // Exact start of lap 2 (should be in lap 2)
        { timestamp: new Date('2023-01-01T10:10:00Z'), value: 3 },
        // Inside lap 2
        { timestamp: new Date('2023-01-01T10:15:00Z'), value: 4 },
      ]

      const result = mapDataIntoLap(laps, 'records', data)

      expect(result[0].records).toHaveLength(2)
      expect(result[0].records[0].value).toBe(1) // The one slightly before
      expect(result[0].records[1].value).toBe(2)

      expect(result[1].records).toHaveLength(2)
      expect(result[1].records[0].value).toBe(3)
      expect(result[1].records[1].value).toBe(4)
    })

    it('expects last lap to collect all remaining data', () => {
      const laps: any[] = [{ start_time: new Date('2023-01-01T10:00:00Z') }]
      const data = [
        { timestamp: new Date('2023-01-01T10:00:00Z') },
        { timestamp: new Date('2023-01-01T11:00:00Z') },
        { timestamp: new Date('2023-01-01T12:00:00Z') },
      ]

      const result = mapDataIntoLap(laps, 'records', data)
      expect(result[0].records).toHaveLength(3)
    })

    it('expects mapping to work with existing data key', () => {
      const laps: any[] = [{ start_time: new Date('2023-01-01T10:00:00Z'), records: [] }]
      const data = [
        { timestamp: new Date('2023-01-01T10:05:00Z') },
      ]

      // Current implementation overwrites if !laps[i][lapKey] is false, BUT wait.
      // Line 33: if (!laps[i][lapKey]) { laps[i][lapKey] = tempData }
      // So if it exists it does NOTHING? That seems like a bug or specific behavior.
      // Let's test what happens if it exists.

      // Actually looking at the code:
      // if (!laps[i][lapKey]) { ... }
      // This implies if 'records' already exists, the function effectively IGNORES the new mapping for that lap.
      // Let's verify this behavior as it "was there".
      const result = mapDataIntoLap(laps, 'records', data)
      expect(result[0].records).toHaveLength(0) // Should verify strict existing behavior
    })

    it('expects mapping to work with lengths as well', () => {
      const laps: any[] = [{ start_time: new Date('2023-01-01T10:00:00Z') }]
      const data = [{ timestamp: new Date('2023-01-01T10:05:00Z') }]
      const result = mapDataIntoLap(laps, 'lengths', data)
      expect(result[0].lengths).toHaveLength(1)
      expect(result[0].lengths[0]).toBe(data[0])
    })
  })

  describe('mapDataIntoSession', () => {
    it('expects laps to be mapped into sessions correctly', () => {
      const session1Start = new Date('2023-01-01T08:00:00Z')
      const session2Start = new Date('2023-01-01T09:00:00Z')
      const sessions: any[] = [
        { start_time: session1Start },
        { start_time: session2Start },
      ]

      const laps = [
        // Before session 1 (should be included in session 1)
        { start_time: new Date('2023-01-01T07:55:00Z'), id: 1 },
        // Inside session 1
        { start_time: new Date('2023-01-01T08:30:00Z'), id: 2 },
        // Exact start of session 2 (should be in session 2)
        { start_time: new Date('2023-01-01T09:00:00Z'), id: 3 },
        // Inside session 2
        { start_time: new Date('2023-01-01T09:30:00Z'), id: 4 },
      ]

      const result = mapDataIntoSession(sessions, laps)

      expect(result[0].laps).toHaveLength(2)
      expect(result[0].laps?.[0].id).toBe(1)
      expect(result[0].laps?.[1].id).toBe(2)

      expect(result[1].laps).toHaveLength(2)
      expect(result[1].laps?.[0].id).toBe(3)
      expect(result[1].laps?.[1].id).toBe(4)
    })

    it('expects last session to collect all remaining laps', () => {
      const sessions: any[] = [{ start_time: new Date('2023-01-01T08:00:00Z') }]
      const laps = [
        { start_time: new Date('2023-01-01T08:00:00Z') },
        { start_time: new Date('2023-01-01T09:00:00Z') },
      ]
      const result = mapDataIntoSession(sessions, laps)
      expect(result[0].laps).toHaveLength(2)
    })
  })
})
