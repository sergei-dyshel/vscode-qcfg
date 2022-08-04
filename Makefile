d := package
include $(d)/Makefile

make = @$(MAKE) --no-print-directory

all: build

npm_install:
	./npm-wrapper.sh install

npm_update:
	./npm-wrapper.sh update

npm_update_major:
	npx ncu -u
	echo "Now run merge changes to common.json make npm_install"

npm_full_reinstall:
	rm -rf node_modules
	$(make) npm_install

TASKS_SCHEMA = tasks.schema.json

$(TASKS_SCHEMA): src/extension/modules/tasks/params.ts
	npx ts-json-schema-generator --no-top-ref --strict-tuples --expose all --path $< --type ConfParamsSet > $@

generate: package.json $(TASKS_SCHEMA)

compile:
	$(make) generate
	webpack --mode none --env DEBUG
	$(make) check

build: | package.json
	rm -rf *.vsix >/dev/null
	vsce package
	git add vscode-qcfg-*.vsix
	git commit --amend --no-edit

install:
	code --install-extension=$(wildcard vscode-qcfg-*.vsix)
	$(make) install_cli

CLI_NAME = q-vscode-cli
CLI_BIN = dist/$(CLI_NAME)

cli:
	echo "#!/usr/bin/env node" > $(CLI_BIN)
	chmod a+x $(CLI_BIN)
	cat dist/remoteCli.js >> $(CLI_BIN)

LOCAL_BIN = ~/.local/bin
LOCAL_BIN_CLI = $(LOCAL_BIN)/$(CLI_NAME)

install_cli:
	mkdir -p $(LOCAL_BIN)
	cp $(CLI_BIN) $(LOCAL_BIN_CLI)
	[[ $$(command -v $(CLI_NAME)) == $$(readlink -f $(LOCAL_BIN_CLI)) ]]

prepublish:
	$(make) generate
	npm version patch --allow-same-version
	webpack --mode production
	$(make) check
	$(make) cli

check_tools:
	node dist/remoteCli.js -h >/dev/null
	bin/q-vscode-syntax-dump -h >/dev/null

update_proposed:
	npx vscode-dts dev

check: check_tools

prettier:
	npx prettier --write "**/*.ts"
