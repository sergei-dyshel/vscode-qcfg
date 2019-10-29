#!/usr/bin/env bash

export npm_config_target=4.2.5
export npm_config_disturl=https://atom.io/download/atom-shell
export JOBS=$(nproc)
npm "$@"
