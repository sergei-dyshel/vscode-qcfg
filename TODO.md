# Bugfixes

- Tasks shows up and running so and can't be cancelled (to reproduce - run build
  of BX while current workspace folder is libebs, libdx etc., then try build
  again now from BX)
- After showing TODOs in side panel, removing some text which contains todo will cause assertion errors becaus tree element wasn't delete.

# Tasks

- Add multi-folder task which will prompt for subset of workspace folders to run
  in.
- Remove specialized commands which are currently handled by tasks:
  - grep word (first needs handling of peek -> panel results transfer)
- Rename Params -> TaskParams etc.

# Utils/helpers

- Make `mapSome*`/`mapAsync*` methods of `Array`.
-

# Big/Long-term

- Adopt style guide, move to ESLint.
- Fix or remove history and selection history.
