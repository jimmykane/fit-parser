import { antfu } from '@antfu/eslint-config'

export default antfu({
  type: 'lib',
  gitignore: true,
  ignores: ['**/test/*.json'],
})
