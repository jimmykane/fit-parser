import type { Buffer } from 'buffer'
import type { DecoderState, MessageTypeDefinition } from './binary.js'
import type {
  ParsedActivity,
  ParsedActivityMetrics,
  ParsedBattery,
  ParsedCoursePoint,
  ParsedDeveloperDataId,
  ParsedDeviceInfo,
  ParsedDiveGas,
  ParsedEvent,
  ParsedFieldDescription,
  ParsedFileId,
  ParsedFit,
  ParsedHrv,
  ParsedHrZone,
  ParsedJump,
  ParsedLap,
  ParsedLength,
  ParsedMonitoring,
  ParsedMonitoringInfo,
  ParsedPowerZone,
  ParsedRawDeveloperField,
  ParsedRawFitMessage,
  ParsedRecord,
  ParsedSession,
  ParsedSet,
  ParsedSplit,
  ParsedSplitSummary,
  ParsedSport,
  ParsedStressLevel,
  ParsedTankSummary,
  ParsedTankUpdate,
  ParsedTimeInZone,
  ParsedUserMetrics,
} from './fit_types.js'
import { calculateCRC, readRecord } from './binary.js'
import { mapDataIntoLap, mapDataIntoSession } from './helper.js'

export { FitBaseType, FitEncoder } from './fit-encoder.js'
export type { FitEncoderField, FitEncoderOptions } from './fit-encoder.js'
export type {
  ParsedFit,
  ParsedRawDeveloperField,
  ParsedRawFitField,
  ParsedRawFitMessage,
  ParsedRawFitMessageDeveloperField,
} from './fit_types.js'
export {
  getFitCoursePointId,
  getFitGarminProductDisplayName,
  getFitGarminProductName,
  getFitManufacturerName,
  getFitSportId,
  getFitSportName,
  getFitSubSportId,
  getFitSubSportName,
} from './profile-lookup.js'
export {
  FitMessageReaderError,
  fitTimestampToUnixMilliseconds,
  getFitBaseTypeId,
  readFitMessages,
  readFitStringField,
  readFitUnsignedField,
} from './raw-message-reader.js'
export type {
  FitMessageReaderErrorCode,
  FitMessageReaderIssue,
  FitMessageReaderIssueCode,
  FitMessageReaderOptions,
  FitMessageReaderResult,
  FitRawDeveloperField,
  FitRawField,
  FitRawMessage,
} from './raw-message-reader.js'

export interface FitParserOptions {
  /** Skips CRC validation and enables supported best-effort recovery. Defaults to true. */
  force?: boolean
  /** Requires complete files and records, and rejects trailing bytes. Defaults to false. */
  strict?: boolean
  speedUnit?: string
  lengthUnit?: string
  temperatureUnit?: string
  elapsedRecordField?: boolean
  pressureUnit?: string
  mode?: 'list' | 'cascade' | 'both'
  /** Retains exact developer-field bytes for all or selected global message numbers. */
  includeRawDeveloperFields?: boolean | readonly number[]
  /** Retains exact native and developer fields for all or selected global message numbers. */
  includeRawMessages?: boolean | readonly number[]
  /** Retains exact bytes for fields that have no semantic profile mapping. */
  includeUnmappedMessages?: boolean
  /** Returns only parser metadata and retained raw messages instead of decoded activity collections. */
  rawMessagesOnly?: boolean
}

type FitParserCallback = (error: string | undefined, data: ParsedFit | undefined) => void

function hasFitHeader(blob: Uint8Array, start: number): boolean {
  const headerLength = blob[start]
  return blob.length - start >= headerLength
    && (headerLength === 12 || headerLength === 14)
    && blob[start + 8] === 0x2E
    && blob[start + 9] === 0x46
    && blob[start + 10] === 0x49
    && blob[start + 11] === 0x54
}

export default class FitParser {
  private readonly options: FitParserOptions

  constructor(options: FitParserOptions = {}) {
    this.options = {
      force: options.force != null ? options.force : true,
      strict: options.strict ?? false,
      speedUnit: options.speedUnit || 'm/s',
      lengthUnit: options.lengthUnit || 'm',
      temperatureUnit: options.temperatureUnit || 'celsius',
      elapsedRecordField: options.elapsedRecordField || false,
      pressureUnit: options.pressureUnit || 'bar',
      mode: options.mode || 'list',
      includeRawDeveloperFields: options.includeRawDeveloperFields ?? false,
      includeRawMessages: options.includeRawMessages ?? false,
      includeUnmappedMessages: options.includeUnmappedMessages ?? false,
      rawMessagesOnly: options.rawMessagesOnly ?? false,
    }
  }

  parseAsync(content: ArrayBuffer | Buffer<ArrayBuffer>): Promise<ParsedFit> {
    return new Promise<ParsedFit>((resolve, reject) => {
      this.parse(content, (error, data) => {
        if (error) {
          reject(error)
        }
        else if (data) {
          resolve(data)
        }
      })
    })
  }

  /**
   * Parses FIT files in input order with independent decoder state. Uses the
   * same force and strict policies as parseAsync; strict mode rejects trailing
   * bytes, while the default ignores a non-FIT suffix after parsed files.
   * Rejects with an Error when any file cannot be parsed.
   */
  async parseFilesAsync(content: ArrayBuffer | Buffer<ArrayBuffer>): Promise<ParsedFit[]> {
    const blob = content instanceof ArrayBuffer
      ? new Uint8Array(content)
      : new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
    const results: ParsedFit[] = []
    let start = 0

    do {
      const remaining = blob.length - start
      const headerLength = blob[start]
      if (results.length > 0 && !this.options.strict && !hasFitHeader(blob, start)) {
        break
      }
      if (remaining < 12) {
        throw new Error('File to small to be a FIT file')
      }
      if (headerLength !== 12 && headerLength !== 14) {
        throw new Error('Incorrect header size')
      }
      if (remaining < headerLength) {
        throw new Error('File to small to be a FIT file')
      }
      if (
        blob[start + 8] !== 0x2E
        || blob[start + 9] !== 0x46
        || blob[start + 10] !== 0x49
        || blob[start + 11] !== 0x54
      ) {
        throw new Error('Missing \'.FIT\' in header')
      }
      const dataLength = new DataView(blob.buffer, blob.byteOffset + start, remaining)
        .getUint32(4, true)
      const crcStart = start + headerLength + dataLength
      // File completeness and CRC checks belong to the shared parser below,
      // preserving the same validation policy and error order in every API.
      let end = Math.min(crcStart + 2, blob.length)
      // Missing CRC bytes can also precede the next file. Check only the
      // declared boundary and its one-byte CRC variant; never scan activity
      // payloads for a guessed file boundary.
      if (this.options.force && !this.options.strict) {
        if (hasFitHeader(blob, crcStart)) {
          end = crcStart
        }
        else if (hasFitHeader(blob, crcStart + 1)) {
          end = crcStart + 1
        }
      }
      try {
        results.push(await new Promise<ParsedFit>((resolve, reject) => {
          this.parseFile(blob.slice(start, end).buffer, (error, data) => {
            if (error) {
              reject(error)
            }
            else if (data) {
              resolve(data)
            }
          })
        }))
      }
      catch (error) {
        throw error instanceof Error ? error : new Error(String(error))
      }
      start = end
    } while (start < blob.length)

    return results
  }

  parse(content: ArrayBuffer | Buffer<ArrayBuffer>, callback: FitParserCallback): void {
    this.parseFile(content, callback)
  }

  private parseFile(
    content: ArrayBuffer | Buffer<ArrayBuffer>,
    callback: FitParserCallback,
  ): void {
    const blob = content instanceof ArrayBuffer
      ? new Uint8Array(content)
      : new Uint8Array(content.buffer, content.byteOffset, content.byteLength)
    const dataView = new DataView(blob.buffer, blob.byteOffset, blob.byteLength)

    if (blob.length < 12) {
      callback('File to small to be a FIT file', undefined)
      return
    }

    const headerLength: number = blob[0]
    if (headerLength !== 14 && headerLength !== 12) {
      callback('Incorrect header size', undefined)
      return
    }

    if (blob.length < headerLength) {
      callback('File to small to be a FIT file', undefined)
      return
    }

    let fileTypeString = ''
    for (let i = 8; i < 12; i++) {
      fileTypeString += String.fromCharCode(blob[i])
    }
    if (fileTypeString !== '.FIT') {
      callback('Missing \'.FIT\' in header', undefined)
      return
    }

    if (headerLength === 14 && !this.options.force) {
      const crcHeader = blob[12] + (blob[13] << 8)
      const crcHeaderCalc = calculateCRC(blob, 0, 12)
      if (crcHeader !== 0 && crcHeader !== crcHeaderCalc) {
        callback('Header CRC mismatch', undefined)
        return
      }
    }

    const protocolVersion: number = blob[1]
    const profileVersion: number = blob[2] + (blob[3] << 8)
    const dataLength = dataView.getUint32(4, true)
    const crcStart = dataLength + headerLength
    if (crcStart > blob.length) {
      callback('File data exceeds input length', undefined)
      return
    }

    if ((!this.options.force || this.options.strict) && crcStart + 2 > blob.length) {
      callback('File CRC missing', undefined)
      return
    }

    if (this.options.strict && crcStart + 2 < blob.length) {
      callback('Unexpected bytes after FIT file', undefined)
      return
    }

    if (!this.options.force) {
      const crcFile = blob[crcStart] + (blob[crcStart + 1] << 8)
      const crcFileCalc = calculateCRC(
        blob,
        0,
        crcStart,
      )

      if (crcFile !== crcFileCalc) {
        callback('File CRC mismatch', undefined)
        return
      }
    }

    const fitObj: Partial<ParsedFit> = {
      profileVersion,
      protocolVersion,
    }
    const messages: Record<string, unknown[]> = {}
    const batteries: ParsedBattery[] = []

    let sessions: ParsedSession[] = []
    let laps: ParsedLap[] = []
    const records: ParsedRecord[] = []
    const events: ParsedEvent[] = []
    const hr_zone: ParsedHrZone[] = []
    const power_zone: ParsedPowerZone[] = []
    const hrv: ParsedHrv[] = []
    const device_infos: ParsedDeviceInfo[] = []
    const applications: ParsedDeveloperDataId[] = []
    const fieldDescriptions: ParsedFieldDescription[] = []
    const dive_gases: ParsedDiveGas[] = []
    const course_points: ParsedCoursePoint[] = []
    const sports: ParsedSport[] = []
    const monitors: ParsedMonitoring[] = []
    const stress: ParsedStressLevel[] = []
    const definitions: unknown[] = []
    const file_ids: ParsedFileId[] = []
    const monitor_info: ParsedMonitoringInfo[] = []
    const lengths: ParsedLength[] = []
    const tank_updates: ParsedTankUpdate[] = []
    const tank_summaries: ParsedTankSummary[] = []
    const jumps: ParsedJump[] = []
    const sets: ParsedSet[] = []
    const splits: ParsedSplit[] = []
    const split_summaries: ParsedSplitSummary[] = []
    const time_in_zone: ParsedTimeInZone[] = []
    const activity_metrics: ParsedActivityMetrics[] = []
    const user_metrics: ParsedUserMetrics[] = []
    const rawDeveloperFields: ParsedRawDeveloperField[] | undefined
      = this.options.includeRawDeveloperFields === true
        || Array.isArray(this.options.includeRawDeveloperFields)
        ? []
        : undefined
    const rawMessages: ParsedRawFitMessage[] | undefined
      = this.options.includeRawMessages === true
        || Array.isArray(this.options.includeRawMessages)
        ? []
        : undefined
    const unmappedMessages: ParsedRawFitMessage[] | undefined
      = this.options.includeUnmappedMessages ? [] : undefined
    const messageCountsByGlobalNumber = new Map<number, number>()

    let loopIndex = headerLength
    const messageTypes: MessageTypeDefinition[] = []
    const developerFields: any[] = []
    const decoderState: DecoderState = {}

    const isModeCascade = this.options.mode === 'cascade'
    const isCascadeNeeded = isModeCascade || this.options.mode === 'both'

    let startDate: number | undefined
    let lastStopTimestamp: number | undefined
    let pausedTime = 0

    while (loopIndex < crcStart) {
      const {
        globalMessageNumber,
        littleEndian,
        message,
        messageType,
        nextIndex,
        compressedTimestamp,
        rawFields: recordRawFields,
        rawDeveloperFields: recordRawDeveloperFields,
        unmappedFields: recordUnmappedFields,
        unmappedDeveloperFields: recordUnmappedDeveloperFields,
      } = readRecord(
        blob,
        messageTypes,
        developerFields,
        loopIndex,
        this.options,
        startDate,
        pausedTime,
        dataView,
        decoderState,
        crcStart,
      )
      if (
        this.options.strict
        && (!Number.isInteger(nextIndex) || nextIndex <= loopIndex || nextIndex > crcStart)
      ) {
        throw new Error('Invalid FIT record bounds')
      }
      loopIndex = nextIndex

      if (globalMessageNumber !== undefined) {
        const messageIndex = messageCountsByGlobalNumber.get(globalMessageNumber) ?? 0
        messageCountsByGlobalNumber.set(globalMessageNumber, messageIndex + 1)
        if (recordRawFields && littleEndian !== undefined) {
          rawMessages?.push({
            global_message_number: globalMessageNumber,
            message_index: messageIndex,
            little_endian: littleEndian,
            ...(compressedTimestamp === undefined
              ? {}
              : { compressed_timestamp: compressedTimestamp }),
            fields: recordRawFields.map(field => ({
              field_definition_number: field.fieldDefinitionNumber,
              base_type: field.baseType,
              raw_value: field.rawValue,
            })),
            developer_fields: (recordRawDeveloperFields ?? []).map(field => ({
              developer_data_index: field.developerDataIndex,
              field_definition_number: field.fieldDefinitionNumber,
              raw_value: field.rawValue,
            })),
          })
        }
        recordRawDeveloperFields?.forEach((field) => {
          rawDeveloperFields?.push({
            global_message_number: globalMessageNumber,
            message_index: messageIndex,
            developer_data_index: field.developerDataIndex,
            field_definition_number: field.fieldDefinitionNumber,
            raw_value: field.rawValue,
          })
        })
        if (
          littleEndian !== undefined
          && (recordUnmappedFields?.length || recordUnmappedDeveloperFields?.length)
        ) {
          unmappedMessages?.push({
            global_message_number: globalMessageNumber,
            message_index: messageIndex,
            little_endian: littleEndian,
            ...(compressedTimestamp === undefined
              ? {}
              : { compressed_timestamp: compressedTimestamp }),
            fields: (recordUnmappedFields ?? []).map(field => ({
              field_definition_number: field.fieldDefinitionNumber,
              base_type: field.baseType,
              raw_value: field.rawValue,
            })),
            developer_fields: (recordUnmappedDeveloperFields ?? []).map(field => ({
              developer_data_index: field.developerDataIndex,
              field_definition_number: field.fieldDefinitionNumber,
              raw_value: field.rawValue,
            })),
          })
        }
      }

      if (this.options.rawMessagesOnly) {
        continue
      }

      if (
        messageType !== ''
        && messageType !== 'definition'
        && message !== undefined
      ) {
        (messages[messageType] ??= []).push(message)
      }

      switch (messageType) {
        case 'battery':
          batteries.push(message)
          break
        case 'lap':
          laps.push(message)
          break
        case 'session':
          sessions.push(message)
          break
        case 'event':
          if (message.event === 'timer') {
            if (message.event_type === 'stop_all') {
              lastStopTimestamp = message.timestamp
            }
            else if (message.event_type === 'start' && lastStopTimestamp) {
              pausedTime += (message.timestamp - lastStopTimestamp) / 1000
            }
          }
          events.push(message)
          break
        case 'length':
          lengths.push(message)
          break
        case 'hrv':
          hrv.push(message)
          break
        case 'hr_zone':
          hr_zone.push(message)
          break
        case 'power_zone':
          power_zone.push(message)
          break
        case 'record':
          if (!startDate) {
            startDate = message.timestamp
            if (this.options.elapsedRecordField) {
              message.elapsed_time = 0
              message.timer_time = 0
            }
          }
          records.push(message)
          break
        case 'field_description':
          fieldDescriptions.push(message)
          break
        case 'device_info':
          device_infos.push(message)
          break
        case 'developer_data_id':
          applications.push(message)
          break
        case 'dive_gas':
          dive_gases.push(message)
          break
        case 'course_point':
          course_points.push(message)
          break
        case 'sport':
          sports.push(message)
          break
        case 'file_id':
          if (message) {
            file_ids.push(message)
          }
          break
        case 'definition':
          if (message) {
            definitions.push(message)
          }
          break
        case 'monitoring':
          monitors.push(message)
          break
        case 'monitoring_info':
          monitor_info.push(message)
          break
        case 'stress_level':
          stress.push(message)
          break
        case 'software':
          fitObj.software = message
          break
        case 'tank_update':
          tank_updates.push(message)
          break
        case 'tank_summary':
          tank_summaries.push(message)
          break
        case 'jump':
          jumps.push(message)
          break
        case 'set':
          sets.push(message)
          break
        case 'split':
          splits.push(message)
          break
        case 'split_summary':
          split_summaries.push(message)
          break
        case 'time_in_zone':
          time_in_zone.push(message)
          break
        case 'activity_metrics':
          activity_metrics.push(message)
          break
        case 'user_metrics':
          user_metrics.push(message)
          break
        default:
          if (messageType !== '') {
            fitObj[messageType as keyof ParsedFit] = message
          }
          break
      }
    }

    if (this.options.rawMessagesOnly) {
      if (rawDeveloperFields) {
        fitObj.raw_developer_fields = rawDeveloperFields
      }
      if (rawMessages) {
        fitObj.raw_messages = rawMessages
      }
      if (unmappedMessages && unmappedMessages.length > 0) {
        fitObj.unmapped_messages = unmappedMessages
      }
      callback(undefined, fitObj as ParsedFit)
      return
    }

    fitObj.hr_zone = hr_zone
    fitObj.power_zone = power_zone
    fitObj.dive_gases = dive_gases
    fitObj.course_points = course_points
    fitObj.sports = sports
    fitObj.monitors = monitors
    fitObj.stress = stress
    fitObj.file_ids = file_ids
    fitObj.monitor_info = monitor_info
    fitObj.definitions = definitions
    fitObj.tank_updates = tank_updates
    fitObj.tank_summaries = tank_summaries
    fitObj.jumps = jumps
    fitObj.splits = splits
    fitObj.split_summaries = split_summaries
    fitObj.time_in_zone = time_in_zone
    fitObj.activity_metrics = activity_metrics
    fitObj.user_metrics = user_metrics
    fitObj.batteries = batteries
    fitObj.messages = messages as ParsedFit['messages']
    if (rawDeveloperFields) {
      fitObj.raw_developer_fields = rawDeveloperFields
    }
    if (rawMessages) {
      fitObj.raw_messages = rawMessages
    }
    if (unmappedMessages && unmappedMessages.length > 0) {
      fitObj.unmapped_messages = unmappedMessages
    }

    if (isCascadeNeeded) {
      laps = mapDataIntoLap(laps, 'records', records)
      laps = mapDataIntoLap(laps, 'lengths', lengths)
      sessions = mapDataIntoSession(sessions, laps)

      fitObj.activity = {
        ...(fitObj.activity ?? {} as ParsedActivity), // ugly but we assume the activity was parsed correctly with all other members correctly
        sessions,
        events,
        hrv,
        device_infos,
        developer_data_ids: applications,
        field_descriptions: fieldDescriptions,
        sports,
        sets,
        splits,
        split_summaries,
      }
    }

    if (!isModeCascade) {
      fitObj.sessions = sessions
      fitObj.laps = laps
      fitObj.lengths = lengths
      fitObj.records = records
      fitObj.events = events
      fitObj.device_infos = device_infos
      fitObj.developer_data_ids = applications
      fitObj.field_descriptions = fieldDescriptions
      fitObj.hrv = hrv
      fitObj.sets = sets
    }

    callback(undefined, fitObj as ParsedFit)
  }
}
