import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { FIT } from '../src/fit.js'
import {
  capitalize,
  generateFitType,
  generateMessages,
  generateOptions,
  generateTypes,
  generateUtilities,
  main,
  snakeToCamel,
  unicodeToChar,
} from '../src/type_generator.js'

function print(nodes: ts.Node[]): string {
  const sourceFile = ts.createSourceFile(
    '',
    '',
    ts.ScriptTarget.Latest,
  )
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
  const nodesArray = ts.factory.createNodeArray(nodes)

  return unicodeToChar(printer.printList(ts.ListFormat.MultiLine, nodesArray, sourceFile))
}

describe('unicode converter', () => {
  it('should convert a string to unicode escape sequences', () => {
    const input = '\u00B0C'
    const expected = '°C'

    expect(unicodeToChar(input)).toEqual(expected)
  })
})

describe('capitalize', () => {
  it('should capitalize a lowercase string', () => {
    const result = capitalize('hello')
    expect(result).toEqual('Hello')
  })

  it('should keep an already capitalized string capitalized', () => {
    const result = capitalize('World')
    expect(result).toEqual('World')
  })

  it('should handle single character strings', () => {
    const result = capitalize('a')
    expect(result).toEqual('A')
  })

  it('should handle empty strings', () => {
    const result = capitalize('')
    expect(result).toEqual('')
  })

  it('should only capitalize the first character', () => {
    const result = capitalize('hello_world')
    expect(result).toEqual('Hello_world')
  })
})

describe('snakeToCamel', () => {
  it('should convert a single word from snake_case to CamelCase', () => {
    expect(snakeToCamel('hello')).toBe('Hello')
  })

  it('should convert a snake_case string to CamelCase', () => {
    expect(snakeToCamel('hello_world')).toBe('HelloWorld')
  })

  it('should handle multiple underscores', () => {
    expect(snakeToCamel('hello__world')).toBe('HelloWorld')
  })

  it('should handle leading and trailing underscores', () => {
    expect(snakeToCamel('_hello_world_')).toBe('HelloWorld')
  })

  it('should handle single character parts', () => {
    expect(snakeToCamel('a_b_c')).toBe('ABC')
  })

  it('should handle an empty string', () => {
    expect(snakeToCamel('')).toBe('')
  })
})

describe('generator', () => {
  it('should generate a Utility types', () => {
    const result = generateUtilities()
    const code = print(result)

    expect(code).toEqual(`export type Unit<T extends string> = Record<T, {
    multiplier: number;
    offset: number;
}>;
export interface MessageIndex {
    0: boolean;
    value: number;
    reserved: boolean;
    selected: boolean;
}
`)
  })

  it('should generate Option interfaces', () => {
    const result = generateOptions(FIT.options as unknown as any)
    const code = print(result)

    expect(code).toEqual(`export type SpeedUnits = "m/s" | "mph" | "km/h";
export type LengthUnits = "m" | "mi" | "km";
export type TemperatureUnits = "°C" | "kelvin" | "fahrenheit";
export type PressureUnits = "cbar" | "bar" | "psi";

export interface FitOptions {
    speedUnits: Unit<SpeedUnits>;
    lengthUnits: Unit<LengthUnits>;
    temperatureUnits: Unit<TemperatureUnits>;
    pressureUnits: Unit<PressureUnits>;
}
`)
  })

  it('should generate Type aliases', () => {
    const result = generateTypes({ file: FIT.types.file })
    const code = print(result)

    expect(code).toEqual(`export type File = "device" | "settings" | "sport" | "activity" | "workout" | "course" | "schedules" | "weight" | "totals" | "goals" | "blood_pressure" | "monitoring_a" | "activity_summary" | "monitoring_daily" | "monitoring_b" | "segment" | "segment_list" | "exd_configuration" | "mfg_range_min" | "mfg_range_max";
`)
  })

  it('should generate Message interface', () => {
    const result = generateMessages({ 0: FIT.messages[0] as unknown as any })

    const code = print(result)

    expect(code).toEqual(`export interface ParsedFileId {
    type?: File;
    manufacturer?: Manufacturer;
    product?: number;
    serial_number?: number;
    time_created?: string;
    number?: number;
    product_name?: string;
}
`)
  })

  it('should generate the response type', () => {
    const result = generateFitType()
    const code = print([result])

    expect(code).toEqual(`export interface ParsedFit {
    protocolVersion?: number;
    profileVersion?: number;
    file_creator: ParsedFileCreator;
    device_settings: ParsedDeviceSettings;
    dive_summary?: ParsedDiveSummary;
    dive_settings?: ParsedDiveSettings;
    software: ParsedSoftware;
    user_profile: ParsedUserProfile;
    activity: ParsedActivity;
    zones_target?: ParsedZonesTarget;
    laps?: ParsedLap[];
    records?: ParsedRecord[];
    sessions?: ParsedSession[];
    lengths?: ParsedLength[];
    events?: ParsedEvent[];
    device_infos?: ParsedDeviceInfo[];
    developer_data_ids?: ParsedDeveloperDataId[];
    field_descriptions?: ParsedFieldDescription[];
    hrv?: ParsedHrv[];
    hr_zone?: ParsedHrZone[];
    power_zone?: ParsedPowerZone[];
    dive_gases?: ParsedDiveGas[];
    course_points?: ParsedCoursePoint[];
    sports?: ParsedSport[];
    monitors?: ParsedMonitoring[];
    stress?: ParsedStressLevel[];
    file_ids?: ParsedFileId[];
    monitor_info?: ParsedMonitoringInfo[];
    definitions?: unknown[];
    tank_updates?: ParsedTankUpdate[];
    tank_summaries?: ParsedTankSummary[];
    jumps?: ParsedJump[];
    time_in_zone?: ParsedTimeInZone[];
}
`)
  })

  it('should generate all in one', () => {
    const code = main()

    const sourceFile = ts.createSourceFile(
      'example.ts',
      code,
      ts.ScriptTarget.Latest,
    )
    expect(sourceFile.statements.length).toBeGreaterThan(0)
    expect(sourceFile.getText()).not.toEqual('')
  })
})
