/**
 * Jest configuration.
 *
 * The `jest-expo` preset is used so the same runner covers both the pure domain
 * tests today and React component tests in later phases, with no second config.
 *
 * Coverage is collected only from `src/game` because that is the layer the
 * project's correctness guarantee rests on — the thresholds below are a gate, not
 * a vanity metric, and are intentionally not applied to UI code.
 */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    '^@game/(.*)$': '<rootDir>/src/game/$1',
    '^@game$': '<rootDir>/src/game',
    '^@state/(.*)$': '<rootDir>/src/state/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@screens/(.*)$': '<rootDir>/src/screens/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '^@data/(.*)$': '<rootDir>/src/data/$1',
    '^@theme/(.*)$': '<rootDir>/src/theme/$1',
    '^@config/(.*)$': '<rootDir>/src/config/$1',
  },
  // `index.ts` is a pure re-export barrel with no logic of its own; counting it
  // only ever drags the number down without telling us anything.
  collectCoverageFrom: ['src/game/**/*.ts', '!src/game/index.ts'],
  coverageThreshold: {
    './src/game/': { branches: 80, functions: 90, lines: 90, statements: 90 },
  },
};
