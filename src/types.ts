export interface ParsedElement {
  [key: string]: any
  message_index?: Record<string, any>
}
export interface ParsedTimestampableElement extends ParsedElement {
  timestamp: string
}

export interface ParsedLap extends ParsedTimestampableElement {
  records?: ParsedTimestampableElement[]
  lengths?: ParsedTimestampableElement[]
}

export interface ParsedActivity extends ParsedTimestampableElement {
  sessions?: ParsedSession[]
  events?: ParsedTimestampableElement[]
  hrv?: ParsedHrv[]
  device_infos?: ParsedTimestampableElement[]
  developer_data_ids?: any[]
  field_descriptions?: any[]
  sports?: ParsedElement[]
}
export interface ParsedSession extends ParsedTimestampableElement {
  laps?: ParsedLap[]
}

export interface ParsedHrv {
  time: number[]
}

export interface ParsedFit {
  protocolVersion: number
  profileVersion: number
  software?: unknown
  user_profile: ParsedElement
  laps?: ParsedLap[]
  records?: ParsedTimestampableElement[]
  sessions?: ParsedSession[]
  activity: ParsedActivity
  lengths?: ParsedElement[]
  events?: ParsedTimestampableElement[]
  device_infos?: ParsedTimestampableElement[]
  developer_data_ids?: ParsedElement[]
  field_descriptions?: ParsedElement[]
  hrv?: ParsedHrv[]
  hr_zone?: ParsedElement[]
  power_zone?: ParsedElement[]
  dive_gases?: ParsedTimestampableElement[]
  course_points?: ParsedElement[]
  sports?: ParsedElement[]
  devices?: ParsedElement[]
  monitors?: ParsedElement[]
  stress?: ParsedElement[]
  file_ids?: ParsedElement[]
  monitor_info?: ParsedElement[]
  definitions?: ParsedElement[]
  tank_updates?: ParsedElement[]
  tank_summaries?: ParsedElement[]
}
