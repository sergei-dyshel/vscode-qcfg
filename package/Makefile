json_merger := npx json-merger --pretty \
	--error-on-file-not-found --error-on-ref-not-found --output

$(d)/relativeJumps.json: src/tools/generateRelativeJumps.ts
	npx ts-node $< >$@

$(d)/macTermBindings.json: src/tools/generateMacTermBindings.ts
	npx ts-node $< >$@

$(d)/configRules.schema.json: src/extension/modules/configRules.model.ts
	npx ts-json-schema-generator --no-top-ref --strict-tuples --expose none --path $< --type Rules --out $@

$(d)/configRules.json: $(d)/configRules.merge.json $(d)/configRules.schema.json
	$(json_merger) $@ $<
	npx prettier --write $@

$(d)/config.json: src/tools/generateConfig.ts src/library/config.ts
	npx ts-node $^ Config.All $@
	npx prettier --write $@

package.json: $(filter-out $(d)/configRules.merge.json $(d)/configRules.schema.json,$(wildcard $(d)/*.json))
	npx ts-node src/tools/updatePackageJson.ts $^
	npx prettier --write $@

commands:
	@./ts-node-mock-vscode src/tools/generateCommands.ts $(d)/commands.json $(wildcard src/extension/modules/*.ts)
