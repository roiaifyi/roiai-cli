module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  maxWorkers: 1,  // Run tests sequentially to avoid port conflicts
  silent: true,    // Suppress console output during tests
  // Use custom reporter for cleaner output (can be overridden with --reporters flag)
  reporters: process.env.VERBOSE_TESTS ? ['default'] : ['<rootDir>/tests/clean-reporter.js']
};