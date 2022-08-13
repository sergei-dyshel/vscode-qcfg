json_merger := npx json-merger --pretty \
	--error-on-file-not-found --error-on-ref-not-found --output

$(d)/relativeJumps.json: src/tools/generateRelativeJumps.ts
	npx ts-node $< >$@

$(d)/macTermBindings.json: src/tools/generateMacTermBindings.ts
	npx ts-node $< >$@

$(d)/config.json: src/tools/generateConfig.ts src/library/config.ts
	npx ts-node $^ Config.All $@
	npx prettier --write $@

package.json: $(wildcard $(d)/*.json)
	npx ts-node src/tools/updatePackageJson.ts $^
	npx prettier --write $@

commands:
	@./ts-node-mock-vscode src/tools/generateCommands.ts $(d)/commands.json $(wildcard src/extension/modules/*.ts)
