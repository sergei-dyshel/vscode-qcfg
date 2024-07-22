d := package

make = @$(MAKE) --no-print-directory

all: build

compile:
	$(make) generate
	npx webpack --mode none --env DEBUG
	$(make) check

install:
	vsce package
	code --uninstall-extension QyRoN.vscode-qcfg
	code --install-extension $$(ls vscode-qcfg-*.vsix | sort --version-sort | tail -n1)
	$(make) install_cli

prepublish:
	$(make) generate
	[[ -z "$$NO_VERSION" ]] && npm version patch --allow-same-version || true
	npx webpack --mode production
	$(make) check
