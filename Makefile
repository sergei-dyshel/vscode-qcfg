d := package
include $(d)/Makefile

npm_pre_install:
	npm install json-merger deepmerge ts-node

npm_install:
	npm_config_target=2.0.9 \
	npm_config_disturl=https://atom.io/download/atom-shell \
	npm install

npm_update:
	npm_config_target=2.0.9 \
	npm_config_disturl=https://atom.io/download/atom-shell \
	npm update

install: | package.json
	rm -rf *.vsix >/dev/null
	vsce package
	code --install-extension=$(shell ls *.vsix)