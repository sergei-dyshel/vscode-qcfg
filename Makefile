d := package
include $(d)/Makefile

npm_pre_install:
	npm install -g vsce
	npm install json-merger deepmerge ts-node typescript @types/node

npm_install: | package.json
	./npm-wrapper.sh install

npm_update: | package.json
	./npm-wrapper.sh update

npm_full_reinstall:
	rm -rf package.json node_modules
	$(MAKE) npm_pre_install
	$(MAKE) package.json
	$(MAKE) npm_install
	$(MAKE) npm_update

TASKS_SCHEMA = tasks.schema.json

$(TASKS_SCHEMA): src/tasks/params.ts
	npx ts-json-schema-generator --no-top-ref --strict-tuples --expose all --path $< --type ConfParamsSet > $@

generate: package.json $(TASKS_SCHEMA)

install: | package.json
	rm -rf *.vsix >/dev/null
	vsce package
	code-oss --install-extension=`ls *.vsix`
