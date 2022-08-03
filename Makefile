d := package
include $(d)/Makefile

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
	$(MAKE) npm_install

TASKS_SCHEMA = tasks.schema.json

$(TASKS_SCHEMA): src/extension/modules/tasks/params.ts
	npx ts-json-schema-generator --no-top-ref --strict-tuples --expose all --path $< --type ConfParamsSet > $@

generate: package.json $(TASKS_SCHEMA)

build: | package.json
	rm -rf *.vsix >/dev/null
	vsce package
	git add vscode-qcfg-*.vsix
	git commit --amend --no-edit

install:
	code --install-extension=$(wildcard vscode-qcfg-*.vsix)

check_tools:
	bin/q-vscode-cli -h >/dev/null
	bin/q-vscode-syntax-dump -h >/dev/null

update_proposed:
	npx vscode-dts dev

check: check_tools

prettier:
	npx prettier --write "**/*.ts"
