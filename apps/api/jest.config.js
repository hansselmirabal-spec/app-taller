module.exports = {
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // Tests de integración (.int.spec.ts) se excluyen del default
  // y se corren con `pnpm test:integration`.
  testPathIgnorePatterns: process.env.RUN_INTEGRATION ? [] : ['\\.int\\.spec\\.ts$'],
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', {
      tsconfig: {
        module: 'commonjs',
        emitDecoratorMetadata: true,
        experimentalDecorators: true,
        strictNullChecks: true,
      },
    }],
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  // Threshold mínimo aceptable en coverage. Si baja, el comando falla.
  // Aplicado solo cuando se corre con --coverage.
  // Thresholds calibrados a la cobertura actual (~49% líneas, ~31% funciones).
  // Suben gradualmente a medida que se sumen tests. Si bajan, CI falla.
  coverageThreshold: {
    global: {
      branches: 40,
      functions: 30,
      lines: 45,
      statements: 45,
    },
  },
  collectCoverageFrom: [
    'modules/**/*.ts',
    'common/**/*.ts',
    '!**/*.entity.ts',
    '!**/*.module.ts',
    '!**/*.spec.ts',
    '!**/index.ts',
  ],
};
