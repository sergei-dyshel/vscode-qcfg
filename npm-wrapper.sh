#!/usr/bin/env bash

export npm_config_target=7.1.11
export npm_config_disturl=https://atom.io/download/atom-shell
export JOBS=$(nproc)
npm --build-from-source "$@"
