#!/usr/bin/env bash

CLI_NAME=q-vscode-cli
CLI_BIN=dist/$CLI_NAME
LOCAL_BIN=~/.local/bin
LOCAL_BIN_CLI=$LOCAL_BIN/$CLI_NAME

echo "#!/usr/bin/env node --no-deprecation" > $CLI_BIN
chmod a+x $CLI_BIN
cat dist/remoteCli.js >> $CLI_BIN

mkdir -p $LOCAL_BIN
cp $CLI_BIN $LOCAL_BIN_CLI
[[ $(command -v $CLI_NAME) == $(readlink -f $LOCAL_BIN_CLI) ]]
