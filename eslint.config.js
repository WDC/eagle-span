import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default [
  { ignores: ['dist/**', '.astro/**', 'node_modules/**', '.vercel/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Build scripts are Node CLIs: console output is the point.
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly' } },
    rules: { 'no-console': 'off', 'no-undef': 'off' },
  },
  {
    /*
     * The one serverless route. `no-console` is a rule about the browser — a
     * log line on a page is noise nobody sees — and on a function it is the
     * inverse: the platform log is the only record that a lead arrived, which
     * layers screened it, and which destinations took it. Warnings and errors
     * were already allowed; this adds the successful case, which is the line
     * you actually want when somebody asks whether a message came through.
     */
    files: ['src/pages/api/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];
