#!/usr/bin/env bash

set -e

dir=$1
out=$2

echo "// auto-generated" > $out
for file in $dir/*.ts; do
    relpath=$(realpath -s --relative-to=$(dirname $out) $file)
    echo "import \"./${relpath%.*}\";" >> $out
done

npx prettier --write $out
