# Bugfixes

- Tasks shows up and running so and can't be cancelled (to reproduce - run build
  of BX while current workspace folder is libebs, libdx etc., then try build
  again now from BX)
- After showing TODOs in side panel, removing some text which contains todo will
  cause assertion errors becaus tree element wasn't deleted.
- Add rules to parse first line of file and change file type accordingly.

# Editing

- Custom tree of diagnostics.
  - Selecting multiple diagnostics also selects corresponding ranges (allows
    easy refactoring such as adding prefix before each symbol)
- Compare two files opened side by side

# Notes functionality

- Add new document in current folder.
- Add new document with date in filename.
- Open in external app.

# Visual

- Add icon to all `qcfg:` commands. See
  [list of icons](https://code.visualstudio.com/api/references/icons-in-labels).
  - Good candidates: `account`, `home`, `heart`, `star`, `star-full`.
- Add `category` property to all commands (may be add icon).

# Documentation

- Create cheat-sheet.

# Tasks

- Periodic tasks
  - Add condition option to run shell command to determite if task is valid.
  - Allow running task periodically.
  - Usecase: check peridodically that new changes for `q-proj` are available,
    then ask use whether to sync.
- Add option for task to remember on which context it ran.
  - For example when building gtest for current file, remember the choice and
    use it even when moved to another file.
- Add option to specify default sync task (`syg`) and add flag _sync_.
- Define tasks in workspace file, not in separate one.
- Allow executing command in the end of task.
- Add multi-folder task which will prompt for subset of workspace folders to run
  in.
- Remove specialized commands which are currently handled by tasks:
- grep word (first needs handling of peek -> panel results transfer)
- Rename Params -> TaskParams etc.
- For q-parse-loc run, multi folder-task, gather locations and present them in
  location dialog
- Tasks for running command for specific set of files, for example organize
  imports in all typescript files. Will open files one by one and run command on
  them.
- Possible improvement: run only on changed files.

# Refactoring

- Make `mapSome*`/`mapAsync*` methods of `Array`.

# Big/Long-term

- Fix history.
