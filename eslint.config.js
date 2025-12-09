import { antfu } from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  gitignore: true,
  ignores: ['**/test/*.json'],
  stylistic: {
    indent: 2,
    quotes: 'single',
  },
  formatters: true,
  rules: {
    'unicorn/prefer-node-protocol': 'off',
  },
})

