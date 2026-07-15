// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    rules: {
      // NestJS DI, decorators y repos usan `any` legítimamente en varios lugares
      // (query builders, resultados raw, DTOs dinámicos) — no lo bloqueamos acá,
      // solo apagamos el ruido; el resto de las reglas recomendadas quedan activas.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
