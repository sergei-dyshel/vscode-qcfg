#!/usr/bin/env bash

export npm_config_runtime=electron
export npm_config_target=19.0.12
export npm_config_disturl=https://electronjs.org/headers
export JOBS=$(nproc)

# prevent re2 installing binaries
export RE2_DOWNLOAD_MIRROR=no

npm --build-from-source "$@"
