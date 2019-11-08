module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'import', 'only-warn'],
  extends: [
    'airbnb',
    'plugin:import/recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier/@typescript-eslint'
  ],
  env: {
    es6: true
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx', '.d.ts']
      }
    }
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  rules: {
    // Place to specify ESLint rules. Can be used to overwrite rules specified
    // from the extended configs
    // e.g. "@typescript-eslint/explicit-function-return-type": "off",
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    strict: 'off',
    curly: 'off',
    'comma-dangle': 'off',
    'import/prefer-default-export': 'off',
    'nonblock-statement-body-position': 'off',
    'import/no-unresolved': 'off',
    'no-restricted-syntax': 'off',
    'prefer-template': 'off',
    'arrow-parens': 'off',
    'max-classes-per-file': 'off',
    'operator-linebreak': 'off',
    'no-useless-constructor': 'off',
    '@typescript-eslint/no-useless-constructor': 'error',
    'no-continue': 'off',
    'no-console': 'off'
  }
};
