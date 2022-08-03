const off = 'off';
const never = 'never';
const warn = 'warn';
const always = 'always';

/**
 * @type {import("eslint").Linter.Config}
 */
const config = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'only-warn', 'sonarjs', 'unicorn'],
  extends: [
    'airbnb',
    'plugin:sonarjs/recommended',
    'plugin:unicorn/recommended',
    'eslint:recommended',
    'plugin:import/recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/all',
    'prettier',
  ],
  env: {
    es6: true,
  },
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
      },
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
    'import/no-extraneous-dependencies': [warn, { devDependencies: true }],
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
    // disable when using organizeImiports
    // 'import/order': [
    //   warn,
    //   {
    //     alphabetize: { order: 'asc' },
    //     'newlines-between': 'always',
    //   },
    // ],
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
    'class-methods-use-this': [warn, { enforceForClassFields: false }],
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
    'no-bitwise': off,
    '@typescript-eslint/no-namespace': off,
    // see: https://github.com/typescript-eslint/typescript-eslint/issues/2077
    '@typescript-eslint/camelcase': off,
    camelcase: [
      warn,
      {
        allow: ['child_process'],
      },
    ],
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
      { allow: ['arrowFunctions', 'private-constructors'] },
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
    '@typescript-eslint/restrict-template-expressions': off,
    '@typescript-eslint/no-untyped-public-signature': off,
    '@typescript-eslint/no-require-imports': off,
    '@typescript-eslint/no-parameter-properties': off,
    '@typescript-eslint/parameter-properties': off,
    'max-len': off,
    '@typescript-eslint/explicit-module-boundary-types': off,
    '@typescript-eslint/prefer-readonly-parameter-types': off,
    '@typescript-eslint/unbound-method': [warn, { ignoreStatic: true }],
    '@typescript-eslint/prefer-literal-enum-member': [off],

    // no-explicit-any is enough
    '@typescript-eslint/no-unsafe-member-access': off,
    '@typescript-eslint/no-unsafe-call': off,
    '@typescript-eslint/no-unsafe-return': off,
    '@typescript-eslint/init-declarations': off,
    'semi-spacing': off,

    '@typescript-eslint/lines-between-class-members': [
      warn,
      { exceptAfterSingleLine: true },
    ],
    '@typescript-eslint/naming-convention': [
      warn,
      {
        selector: 'enumMember',
        format: ['UPPER_CASE'],
      },
    ],
    '@typescript-eslint/prefer-enum-initializers': off,

    // conflicts with prettier (bracket-spacing)
    'object-curly-spacing': off,
    '@typescript-eslint/object-curly-spacing': [warn, always],

    '@typescript-eslint/sort-type-union-intersection-members': off,
    'import/no-duplicates': off,

    'sonarjs/cognitive-complexity': off,

    // sometimes assigning to variable and returning it is convenient for debugging
    'sonarjs/prefer-immediate-return': off,

    // still using CommonJS for modules
    'unicorn/prefer-module': off,

    // too aggressive
    'unicorn/better-regex': off,

    'unicorn/prevent-abbreviations': off,
    'unicorn/filename-case': [
      warn,
      {
        case: 'camelCase',
      },
    ],

    // triggers on `return undefined;`
    'unicorn/no-useless-undefined': off,

    'unicorn/catch-error-name': [
      warn,
      {
        name: 'err',
      },
    ],

    // complains about passing functions to `map`
    'unicorn/no-array-callback-reference': off,

    // will refactor this one day
    'unicorn/no-array-reduce': off,

    // do not require sorted character classes
    'unicorn/better-regex': [warn, { sortCharacterClasses: false }],

    // do not enforce having group seprators
    // (grepping for number will not work as expected)
    'unicorn/numeric-separators-style': [
      warn,
      { onlyIfContainsSeparator: true },
    ],
  },
};

module.exports = config;
