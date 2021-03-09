#!/usr/bin/env bash

export npm_config_target=11.3.0
export npm_config_disturl=https://atom.io/download/atom-shell
export JOBS=$(nproc)

# prevent re2 installing binaries
export RE2_DOWNLOAD_MIRROR=no

npm --build-from-source "$@"
