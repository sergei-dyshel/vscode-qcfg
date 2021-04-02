# Bugfixes

- Tasks shows up and running so and can't be cancelled (to reproduce - run build
  of BX while current workspace folder is libebs, libdx etc., then try build
  again now from BX)
- After showing TODOs in side panel, removing some text which contains todo will
  cause assertion errors becaus tree element wasn't delete.
- Log commands execution (executeCommand)
- "Couldn't focus window with 'node-window-manager'." - something doesn't work
- Set INFO=>DEBUG for:

```
20:03:03.045 INFO modules/autoSync.ts:73:2 onSaveAll() Auto syncing src/ebs_managed_stages_gameday/meta/yaml/input_templates/sled_events_input.yml in EbsManagedStagesGameday (under /Users/sergei/amazon/repos/EbsManagedStagesGameday)
20:03:03.054 INFO modules/gtags.ts:57:2 onSaveAll() Gtags on src/ebs_managed_stages_gameday/meta/yaml/input_templates/sled_events_input.yml in "EbsManagedStagesGameday"
```

# Notes functionality

- Add new document in current folder.
- Add new document with date in filename.
- Open in external app.

# Documentation

- Create cheat-sheet.

# Tasks

- Allow executing command in the end of task.
- Add multi-folder task which will prompt for subset of workspace folders to run
  in.
- Remove specialized commands which are currently handled by tasks:
  - grep word (first needs handling of peek -> panel results transfer)
- Rename Params -> TaskParams etc.

# Refactoring

- Make `mapSome*`/`mapAsync*` methods of `Array`.
-

# Big/Long-term

- Fix history.
