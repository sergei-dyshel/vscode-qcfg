deps := common tasks alternate treeSitter autoSync editing treeView
deps_files := $(patsubst %,$(d)/%.json,$(deps))
json_merger := npx json-merger --pretty \
	--error-on-file-not-found --error-on-ref-not-found --output
my_merger := npx ts-node src/merge.ts

$(d)/tasks.json: $(d)/tasks.merge.json $(d)/tasks.base.json
	$(json_merger) $@ $<

package.json: $(deps_files)
	$(my_merger) $@ $^