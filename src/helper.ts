import type { ParsedLap, ParsedSession } from './types.js'

export function mapDataIntoLap(
  inputLaps: ParsedLap[],
  lapKey: 'records' | 'lengths',
  data: any[],
): ParsedLap[] {
  const laps = [...inputLaps]
  let index = 0
  for (let i = 0; i < laps.length; i++) {
    const lap = laps[i]
    const nextLap = laps[i + 1]
    const tempData = []
    const lapStartTime = new Date(lap.start_time).getTime()
    const nextLapStartTime = nextLap
      ? new Date(nextLap.start_time).getTime()
      : null
    for (let j = index; j < data.length; j++) {
      const row = data[j]
      if (nextLap && nextLapStartTime) {
        const timestamp = new Date(row.timestamp).getTime()
        if (lapStartTime <= timestamp && nextLapStartTime > timestamp) {
          tempData.push(row)
        }
        else if (nextLapStartTime <= timestamp) {
          index = j
          break
        }
      }
      else {
        tempData.push(row)
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
    const session = sessions[i]
    const nextSession = sessions[i + 1]
    const tempLaps = []
    const sessionStartTime = new Date(session.start_time).getTime()
    const nextSessionStartTime = nextSession
      ? new Date(nextSession.start_time).getTime()
      : null
    for (let j = lapIndex; j < laps.length; j++) {
      const lap = laps[j]
      if (nextSession && nextSessionStartTime) {
        const lapStartTime = new Date(lap.start_time).getTime()
        if (
          sessionStartTime <= lapStartTime
          && nextSessionStartTime > lapStartTime
        ) {
          tempLaps.push(lap)
        }
        else if (nextSessionStartTime <= lapStartTime) {
          lapIndex = j
          break
        }
      }
      else {
        tempLaps.push(lap)
      }
    }

    if (!sessions[i].laps) {
      sessions[i].laps = tempLaps
    }
  }
  return sessions
}
