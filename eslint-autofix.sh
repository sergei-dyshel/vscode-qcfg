#!/usr/bin/env bash

exec npx eslint \
    --color \
    --format unix \
    --ext .ts \
    --no-eslintrc \
    --config .eslintrc.autofix.js \
    --no-error-on-unmatched-pattern \
    --quiet \
    $(git ls-files --modified --others "src/**/*.ts") \
    "$@"
