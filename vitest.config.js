import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.js', 'test/**/*.ts'],
    globals: true,
  },
})
