# Bugfixes

- Support nested workspace folders for auto-sync: sync of file in workspace
  folder that's doesn't have `.syg.json` should go up until it finds one
  (example: file in `qyron-config/tmux-clost-devel`).
- Tasks shows up and running so and can't be cancelled (to reproduce - run build
  of BX while current workspace folder is libebs, libdx etc., then try build
  again now from BX)
- After showing TODOs in side panel, removing some text which contains todo will
  cause assertion errors becaus tree element wasn't delete.
- Log commands execution (executeCommand)

# Small features

- Auto-sync: show in status.

# Notes functionality

- Auto toggle markdown preview.
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
