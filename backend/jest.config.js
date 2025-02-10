export default {
  testEnvironment: 'node',
  transform: {},
  extensionsToTreatAsEsm: ['.js'],
  moduleNameMapper: {
    '^(\.{1,2}/.*)\.js$': '$1'
  },
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  setupFiles: ['<rootDir>/jest.setup.js'],
  testTimeout: 10000,
  verbose: true,
  roots: ['<rootDir>'],
  modulePaths: ['<rootDir>/src']
};