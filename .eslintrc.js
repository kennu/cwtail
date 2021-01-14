module.exports = {
  env: {
    node: true,
    es6: true,
  },
  parserOptions: {
    ecmaVersion: 8,
    sourceType: 'module',
  },
  extends: 'eslint:recommended',
  rules: {
    indent: [ 'error', 2 ],
    'linebreak-style': [ 'error', 'unix' ],
    quotes: [ 'error', 'single', { allowTemplateLiterals: true } ],
    semi: [ 'error', 'always' ],
    'no-console': 0,
    'no-unused-vars': [ 'error', { 'args': 'none' } ],
    'prefer-const': [ 'error' ],
    'indent': [ 'error', 2, { 'SwitchCase': 1 } ],
  }
};
