import type { ParsedLap, ParsedSession } from './fit_types.js'

function timestampValue(value: unknown): number | undefined {
  if (value === undefined || value === null) {
    return undefined
  }
  const timestamp = value instanceof Date
    ? value.getTime()
    : new Date(value as string | number).getTime()
  return Number.isFinite(timestamp) ? timestamp : undefined
}

export function mapDataIntoLap(
  inputLaps: ParsedLap[],
  lapKey: 'records' | 'lengths',
  data: any[],
): ParsedLap[] {
  const laps = [...inputLaps]
  let index = 0
  for (let i = 0; i < laps.length; i++) {
    const nextLap = laps[i + 1]
    const tempData = []
    const nextLapStartTime = timestampValue(nextLap?.start_time)
    for (let j = index; j < data.length; j++) {
      const row = data[j]
      if (nextLap && nextLapStartTime !== undefined) {
        const timestamp = timestampValue(row.timestamp ?? row.start_time)
        if (timestamp === undefined || nextLapStartTime > timestamp) {
          tempData.push(row)
          index = j + 1
        }
        else if (nextLapStartTime <= timestamp) {
          index = j
          break
        }
      }
      else {
        tempData.push(row)
        index = j + 1
      }
    }

    if (!laps[i][lapKey]) {
      laps[i][lapKey] = tempData
    }
  }

  return laps
}

export function mapDataIntoSession(
  inputSessions: ParsedSession[],
  laps: ParsedLap[],
): ParsedSession[] {
  const sessions = [...inputSessions]
  let lapIndex = 0
  for (let i = 0; i < sessions.length; i++) {
    const nextSession = sessions[i + 1]
    const tempLaps = []
    const nextSessionStartTime = timestampValue(nextSession?.start_time)
    for (let j = lapIndex; j < laps.length; j++) {
      const lap = laps[j]
      if (nextSession && nextSessionStartTime !== undefined) {
        const lapStartTime = timestampValue(lap.start_time)
        if (lapStartTime === undefined || nextSessionStartTime > lapStartTime) {
          tempLaps.push(lap)
          lapIndex = j + 1
        }
        else if (nextSessionStartTime <= lapStartTime) {
          lapIndex = j
          break
        }
      }
      else {
        tempLaps.push(lap)
        lapIndex = j + 1
      }
    }

    if (!sessions[i].laps) {
      sessions[i].laps = tempLaps
    }
  }
  return sessions
}
