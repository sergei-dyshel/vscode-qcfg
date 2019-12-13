off = 'off';
never = 'never';
warn = 'warn';
always = 'always';

module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'only-warn'],
  extends: [
    'airbnb',
    'plugin:import/recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier/@typescript-eslint',
  ],
  env: {
    es6: true,
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.d.ts'],
      },
    },
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    project: './tsconfig.json',
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
    'no-extend-native': [warn, { exceptions: ['Array', 'Set', 'Map'] }],
    'no-restricted-globals': off,
    'no-nested-ternary': off,
    'arrow-function': off,
    '@typescript-eslint/no-empty-function': [
      warn,
      { allow: ['arrowFunctions'] },
    ],
    'new-cap': [warn, { newIsCapExceptions: ['default'] }],
  },
};
