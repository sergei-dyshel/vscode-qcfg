d := package
include $(d)/Makefile

npm_pre_install:
	npm install json-merger deepmerge ts-node

npm_install: | package.json
	npm_config_target=3.1.2 \
	npm_config_disturl=https://atom.io/download/atom-shell \
	JOBS=$(shell nproc) \
	npm install

npm_update: | package.json
	npm_config_target=3.1.2 \
	npm_config_disturl=https://atom.io/download/atom-shell \
	JOBS=$(shell nproc) \
	npm update

install: | package.json
	rm -rf *.vsix >/dev/null
	vsce package
	code --install-extension=`ls *.vsix`
