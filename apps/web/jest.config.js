module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)sx?$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        jsx: 'react-jsx',
        esModuleInterop: true,
        paths: {
          '@/*': ['<rootDir>/*'],
        },
      },
    }],
  },
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Threshold mínimo. UI no se testea, threshold sobre lib/ y hooks/.
  // Calibrados a la cobertura actual de utils. Subir a medida que se sumen tests.
  coverageThreshold: {
    global: {
      branches: 15,
      functions: 10,
      lines: 25,
      statements: 25,
    },
  },
  collectCoverageFrom: [
    'lib/**/*.ts',
    'hooks/**/*.ts',
    '!**/*.spec.ts',
  ],
};
