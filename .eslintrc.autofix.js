const off = 'off';
const never = 'never';
const warn = 'warn';
const always = 'always';
const error = 'error';

/**
 * @type {import("eslint").Linter.Config}
 */

const config = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import'],
  env: {
    es6: true,
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.ts', '.tsx'],
      },
    },
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  rules: {
    '@typescript-eslint/consistent-type-imports': error,
  },
};

module.exports = config;
