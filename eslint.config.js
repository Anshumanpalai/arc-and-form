import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        console: 'readonly', process: 'readonly', window: 'readonly', document: 'readonly',
        fetch: 'readonly', URLSearchParams: 'readonly'
      }
    },
    rules: { 'no-console': 'off', 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] }
  }
];
