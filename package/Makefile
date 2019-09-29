deps := common tasks alternate treeSitter autoSync editing treeView \
	relativeJumps navigation multipleSelection macTermBindings
deps_files := $(patsubst %,$(d)/%.json,$(deps))
json_merger := npx json-merger --pretty \
	--error-on-file-not-found --error-on-ref-not-found --output
my_merger := npx ts-node src/merge.ts

$(d)/tasks.json: $(d)/tasks.merge.json $(d)/tasks.base.json
	$(json_merger) $@ $<

$(d)/relativeJumps.json: src/generateRelativeJumps.ts
	npx ts-node $< >$@

$(d)/macTermBindings.json: src/generateMacTermBindings.ts
	npx ts-node $< >$@

package.json: $(deps_files)
	$(my_merger) $@ $^