d := package
include $(d)/Makefile

npm_pre_install:
	npm install -g vsce
	npm install json-merger deepmerge ts-node typescript @types/node

npm_install: | package.json
	npm_config_target=4.2.5 \
	npm_config_disturl=https://atom.io/download/atom-shell \
	JOBS=$(shell nproc) \
	npm install

npm_update: | package.json
	npm_config_target=4.2.5 \
	npm_config_disturl=https://atom.io/download/atom-shell \
	JOBS=$(shell nproc) \
	npm update

npm_full_reinstall:
	rm -rf package.json node_modules
	$(MAKE) npm_pre_install
	$(MAKE) package.json
	$(MAKE) npm_install
	$(MAKE) npm_update

TASKS_SCHEMA = tasks.schema.json

$(TASKS_SCHEMA): src/tasks/taskParams.ts
	npx ts-json-schema-generator -r -s -p $< -t ParamsMap > $@

generate: package.json $(TASKS_SCHEMA)

install: | package.json
	rm -rf *.vsix >/dev/null
	vsce package
	code-oss --install-extension=`ls *.vsix`
