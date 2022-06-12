deps := common tasks alternate treeSitter autoSync editing treeView \
	relativeJumps navigation multipleSelection macTermBindings formatting \
	plistOld search peekOutline editorGroups langClient git misc selection \
	configRules notes diagnostics autoResize symbolDb
deps_files := $(patsubst %,$(d)/%.json,$(deps))
json_merger := npx json-merger --pretty \
	--error-on-file-not-found --error-on-ref-not-found --output
my_merger := npx ts-node src/tools/merge.ts

$(d)/relativeJumps.json: src/tools/generateRelativeJumps.ts
	npx ts-node $< >$@

$(d)/macTermBindings.json: src/tools/generateMacTermBindings.ts
	npx ts-node $< >$@

$(d)/configRules.schema.json: src/extension/modules/configRules.model.ts
	npx ts-json-schema-generator --no-top-ref --strict-tuples --expose none --path $< --type Rules > $@

$(d)/configRules.json: $(d)/configRules.merge.json $(d)/configRules.schema.json
	$(json_merger) $@ $<

package.json: $(deps_files)
	$(my_merger) $@ $^
	npx prettier --write $@
