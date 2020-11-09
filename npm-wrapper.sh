#!/usr/bin/env bash

export npm_config_target=9.3.3
export npm_config_disturl=https://atom.io/download/atom-shell
export JOBS=$(nproc)

# prevent re2 installing binaries
export RE2_DOWNLOAD_MIRROR=no

npm --build-from-source "$@"
