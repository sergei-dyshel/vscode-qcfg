const off = 'off';
const never = 'never';
const warn = 'warn';
const always = 'always';

module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'only-warn'],
  extends: [
    'airbnb',
    'plugin:import/recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/all',
    'prettier/@typescript-eslint',
  ],
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
    project: './tsconfig.eslint.json',
  },
  rules: {
    // Place to specify ESLint rules. Can be used to overwrite rules specified
    // from the extended configs
    // e.g. "@typescript-eslint/explicit-function-return-type": "off",
    '@typescript-eslint/no-unused-vars': off,
    '@typescript-eslint/explicit-function-return-type': off,
    strict: off,
    curly: off,
    'comma-dangle': off,
    'import/prefer-default-export': off,
    'nonblock-statement-body-position': off,
    'import/no-unresolved': off,
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        ts: 'never',
      },
    ],
    'no-restricted-syntax': off,
    'prefer-template': off,
    'arrow-parens': off,
    'max-classes-per-file': off,
    'operator-linebreak': off,
    'no-useless-constructor': off,
    '@typescript-eslint/no-useless-constructor': 'error',
    'no-continue': off,
    'no-console': off,
    'import/order': off,
    'prefer-destructuring': off,
    'no-await-in-loop': off,
    'spaced-comment': [warn, always, { markers: ['/'] }],
    'object-curly-newline': off,
    'lines-between-class-members': [
      warn,
      always,
      { exceptAfterSingleLine: true },
    ],
    '@typescript-eslint/no-use-before-define': off,
    'no-confusing-arrow': off,
    'implicit-arrow-linebreak': off,
    'function-paren-newline': off,
    'default-case': off,
    'no-param-reassign': off,
    'consistent-return': off,
    'no-useless-return': off,
    '@typescript-eslint/no-non-null-assertion': off,
    'func-names': [warn, never],
    // 'space-before-function-paren': [warn, { anonymous: ignore, named: never }],
    'space-before-function-paren': off,
    '@typescript-eslint/no-var-requires': off,
    'global-require': off,
    'no-plusplus': [warn, { allowForLoopAfterthoughts: true }],
    'no-constant-condition': [warn, { checkLoops: false }],
    '@typescript-eslint/no-namespace': off,
    '@typescript-eslint/camelcase': [warn, { allow: ['child_process'] }],
    'no-inner-declarations': off,
    'no-underscore-dangle': off,
    '@typescript-eslint/no-explicit-any': [warn, { ignoreRestArgs: true }],
    'no-extend-native': [
      warn,
      { exceptions: ['Array', 'Set', 'Map', 'Promise'] },
    ],
    'no-restricted-globals': off,
    'no-nested-ternary': off,
    'arrow-function': off,
    '@typescript-eslint/no-empty-function': [
      warn,
      { allow: ['arrowFunctions'] },
    ],
    'new-cap': [warn, { newIsCapExceptions: ['default'] }],
    indent: off,
    '@typescript-eslint/no-type-alias': off,
    '@typescript-eslint/explicit-member-accessibility': [
      warn,
      {
        accessibility: 'no-public',
      },
    ],
    '@typescript-eslint/member-ordering': off,
    '@typescript-eslint/typedef': off,
    '@typescript-eslint/array-type': [warn, { default: 'array-simple' }],
    '@typescript-eslint/generic-type-naming': off,
    '@typescript-eslint/no-extraneous-class': [
      warn,
      {
        allowEmpty: true,
      },
    ],
    '@typescript-eslint/no-magic-numbers': off,
    '@typescript-eslint/strict-boolean-expressions': off,
    '@typescript-eslint/restrict-template-expressions': [
      warn,
      {
        allowNumber: true,
        allowBoolean: true,
        allowNullable: false,
      },
    ],
    '@typescript-eslint/no-untyped-public-signature': off,
    '@typescript-eslint/no-require-imports': off,
    '@typescript-eslint/no-parameter-properties': off,
    'max-len': off,
    '@typescript-eslint/explicit-module-boundary-types': off,
    '@typescript-eslint/prefer-readonly-parameter-types': off,
    '@typescript-eslint/unbound-method': [warn, { ignoreStatic: true }],

    // no-explicit-any is enough
    '@typescript-eslint/no-unsafe-member-access': off,
    '@typescript-eslint/no-unsafe-call': off,
    '@typescript-eslint/no-unsafe-return': off,
    '@typescript-eslint/init-declarations': off,
    'semi-spacing': off,
  },
};
