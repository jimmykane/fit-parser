import { getArrayBuffer, calculateCRC, readRecord } from './binary';
import { mapDataIntoSession, mapDataIntoLap } from './helper';
export default class FitParser {
  constructor(options = {}) {
    this.options = {
      force: options.force != null ? options.force : true,
      speedUnit: options.speedUnit || 'm/s',
      lengthUnit: options.lengthUnit || 'm',
      temperatureUnit: options.temperatureUnit || 'celsius',
      elapsedRecordField: options.elapsedRecordField || false,
      pressureUnit: options.pressureUnit || 'bar',
      mode: options.mode || 'list',
    };
  }

  parse(content, callback) {
    const blob = new Uint8Array(getArrayBuffer(content));

    if (blob.length < 12) {
      callback('File to small to be a FIT file', {});
      if (!this.options.force) {
        return;
      }
    }

    const headerLength = blob[0];
    if (headerLength !== 14 && headerLength !== 12) {
      callback('Incorrect header size', {});
      if (!this.options.force) {
        return;
      }
    }

    let fileTypeString = '';
    for (let i = 8; i < 12; i++) {
      fileTypeString += String.fromCharCode(blob[i]);
    }
    if (fileTypeString !== '.FIT') {
      callback('Missing \'.FIT\' in header', {});
      if (!this.options.force) {
        return;
      }
    }

    if (headerLength === 14) {
      const crcHeader = blob[12] + (blob[13] << 8);
      const crcHeaderCalc = calculateCRC(blob, 0, 12);
      if (crcHeader !== crcHeaderCalc) {
        // callback('Header CRC mismatch', {});
        // TODO: fix Header CRC check
        if (!this.options.force) {
          return;
        }
      }
    }

    const protocolVersion = blob[1];
    const profileVersion = blob[2] + (blob[3] << 8);
    const dataLength = blob[4] + (blob[5] << 8) + (blob[6] << 16) + (blob[7] << 24);
    const crcStart = dataLength + headerLength;
    const crcFile = blob[crcStart] + (blob[crcStart + 1] << 8);
    const crcFileCalc = calculateCRC(blob, headerLength === 12 ? 0 : headerLength, crcStart);

    if (crcFile !== crcFileCalc) {
      // callback('File CRC mismatch', {});
      // TODO: fix File CRC check
      if (!this.options.force) {
        return;
      }
    }

    const fitObj = {};
    fitObj.protocolVersion = protocolVersion;
    fitObj.profileVersion = profileVersion;

    let sessions = [];
    let laps = [];
    const records = [];
    const events = [];
    const hrv = [];
    const hr_zone = [];
    const power_zone = [];
    const devices = [];
    const applications = [];
    const fieldDescriptions = [];
    const dive_gases = [];
    const course_points = [];
    const sports = [];
    const monitors = [];
    const stress = [];
    const definitions = [];
    const file_ids = [];
    const monitor_info = [];
    const lengths = [];
    const tank_updates = [];
    const tank_summaries = [];

    let loopIndex = headerLength;
    const messageTypes = [];
    const developerFields = [];

    const isModeCascade = this.options.mode === 'cascade';
    const isCascadeNeeded = isModeCascade || this.options.mode === 'both';

    let startDate;
    let lastStopTimestamp;
    let pausedTime = 0;

    while (loopIndex < crcStart) {
      const { nextIndex,
        messageType,
        message } = readRecord(blob, messageTypes, developerFields, loopIndex, this.options, startDate, pausedTime);
      loopIndex = nextIndex;

      switch (messageType) {
        case 'lap':
          laps.push(message);
          break;
        case 'session':
          sessions.push(message);
          break;
        case 'event':
          if (message.event === 'timer') {
            if (message.event_type === 'stop_all') {
              lastStopTimestamp = message.timestamp;
            } else if (message.event_type === 'start' && lastStopTimestamp) {
              pausedTime += (message.timestamp - lastStopTimestamp) / 1000;
            }
          }
          events.push(message);
          break;
        case 'length':
          lengths.push(message);
          break;
        case 'hrv':
          hrv.push(message);
          break;
        case 'hr_zone':
          hr_zone.push(message);
          break;
        case 'power_zone':
          power_zone.push(message);
          break;          
        case 'record':
          if (!startDate) {
            startDate = message.timestamp;
            message.elapsed_time = 0;
            message.timer_time = 0;
          }
          records.push(message);
          break;
        case 'field_description':
          fieldDescriptions.push(message);
          break;
        case 'device_info':
          devices.push(message);
          break;
        case 'developer_data_id':
          applications.push(message);
          break;
        case 'dive_gas':
          dive_gases.push(message);
          break;
        case 'course_point':
          course_points.push(message);
          break;
        case 'sport':
          sports.push(message);
          break;
        case 'file_id':
          if (message) {
            file_ids.push(message);
          }
          break;
        case 'definition':
          if (message) {
            definitions.push(message);
          }
          break;
        case 'monitoring':
          monitors.push(message);
          break;
        case 'monitoring_info':
          monitor_info.push(message);
          break;
        case 'stress_level':
          stress.push(message);
          break;
        case 'software':
          fitObj.software = message;
          break;
        case 'tank_update':
          tank_updates.push(message);
          break;
        case 'tank_summary':
          tank_summaries.push(message);
          break;
        default:
          if (messageType !== '') {
            fitObj[messageType] = message;
          }
          break;
      }
    }

    if (isCascadeNeeded) {
      fitObj.activity = fitObj.activity || {};
      laps = mapDataIntoLap(laps, 'records', records);
      laps = mapDataIntoLap(laps, 'lengths', lengths);
      sessions = mapDataIntoSession(sessions, laps);
      fitObj.activity.sessions = sessions;
      fitObj.activity.events = events;
      fitObj.activity.hrv = hrv;
      fitObj.hr_zone = hr_zone;
      fitObj.power_zone = power_zone;
      fitObj.activity.device_infos = devices;
      fitObj.activity.developer_data_ids = applications;
      fitObj.activity.field_descriptions = fieldDescriptions;
      fitObj.activity.sports = sports;
    }
    if (!isModeCascade) {
      fitObj.sessions = sessions;
      fitObj.laps = laps;
      fitObj.lengths = lengths;
      fitObj.records = records;
      fitObj.events = events;
      fitObj.device_infos = devices;
      fitObj.developer_data_ids = applications;
      fitObj.field_descriptions = fieldDescriptions;
      fitObj.hrv = hrv;
      fitObj.hr_zone = hr_zone;
      fitObj.power_zone = power_zone;
      fitObj.dive_gases = dive_gases;
      fitObj.course_points = course_points;
      fitObj.sports = sports;
      fitObj.devices = devices;
      fitObj.monitors = monitors;
      fitObj.stress = stress;
      fitObj.file_ids = file_ids;
      fitObj.monitor_info = monitor_info;
      fitObj.definitions = definitions;
      fitObj.tank_updates = tank_updates;
      fitObj.tank_summaries = tank_summaries;
    }

    callback(null, fitObj);
  }
}
