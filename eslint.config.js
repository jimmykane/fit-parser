import { antfu } from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  gitignore: true,
  ignores: ['.agent/**', '**/test/*.json'],
  stylistic: {
    indent: 2,
    quotes: 'single',
  },
  formatters: true,
  rules: {
    'unicorn/prefer-node-protocol': 'off',
  },
}, {
  files: ['**/examples/*.js', '**/codegen/*.ts', '**/probe_session.js', '**/deep_probe.js'],
  rules: {
    'no-console': 'off',
  },
}, {
  files: ['check_ids.js', 'check_jump_fields.js', 'find_field.js', 'find_field_esm.js', 'inspect_parser.ts', 'scan_jumps.js'],
  rules: {
    'antfu/no-import-dist': 'off',
    'no-console': 'off',
    'style/max-statements-per-line': 'off',
    'ts/explicit-function-return-type': 'off',
    'unicorn/prefer-number-properties': 'off',
  },
}, {
  files: ['scripts/deep_probe.js', 'scripts/inspect_fit.js'],
  rules: {
    'node/prefer-global/process': 'off',
    'unicorn/prefer-number-properties': 'off',
    'unused-imports/no-unused-vars': 'off',
  },
})
