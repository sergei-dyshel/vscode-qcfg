# Intro

This is my personal VScode extension I'm constantly developing in my spare time.
It does not focus on specific functionality but rather acts as big collections
of shortcuts, macros, tips and tricks I've accumulated over time. Some of them
are simple and polished, others are very hacky and at experimental stage.

The extension is very tweaked to my taste and hence not suitable for public use.
It also uses some scripts from my personal _dotfiles_ repo (private at the
moment). However many ideas deserve to be extracted into full-featured plugins
and I will be extremely happy to see my ideas borrowed and improved.

# Major features

## Revamped task system

At the time I started using VScode its tasks support was much more limited than
it is now so I decided to write my own task definition format which use native
tasks under the hood. Task definitions schema (see
[params.ts](src/extension/modules/tasks/params.ts) ) expands that native tasks
and adds some small and useful features:

- **Global**, per-workspace and per-folder task definition files.
- Dictionary `{ 'task-name': <task definition>, ....}` instead of array where
  the most simple form of task definition may be just a string of shell command.
- More customizable terminal _reveal_ options, _on success_ and _on failure_
  hooks and conditions.
- Advanced template substitution.
- Task output can be parsed to list of code locations and presented in peek
  view.
- Search tasks - using template substitution search for some text and present
  results in peek view. Example: using current word as C _struct_ field and
  search for `.word` or `->word` to find all references of this field.
- Conditional tasks - tasks available only if some condition holds. Example:
  _git_-related tasks
- are showed only if `.git` exists in root directory.
- Multi-folder tasks - for workspace with multiple workspace folders a task can
  be defined to run in all folders at once. Example: run `git pull` in all
  workspace folders that are _git_ repos.

## _Tree-sitter_-based code navigation

[Tree-sitter](https://tree-sitter.github.io/tree-sitter/) is modern syntax
parser that supports many languages. It's very fast and robust and has
Javascript bindings. Originally developed for Atom editor it is now being used
in other editors and IDEs. I'm utilizing it for specific purpose - tree-like
code navigation. Think of [Par Edit](https://www.emacswiki.org/emacs/ParEdit)
for non-Lisp languages!

Treating source code as syntax tree and navigating this tree with cursor keys in
a modal fashion can be much faster than traditional by-character/line/word
navigation.

This feature is at early **experimental** phase and more detailed description to
follow.

## Remote client-server API

Similarly to VIM's [remote](http://vimdoc.sourceforge.net/htmldoc/remote.html)
feature there is a server API and CLI tool that allows to list open VScode
windows and to execute specific command in given window. Very handy for
integrating VScode with external tools.

# Minor features

- Switching to alternate (e.g. C source <=> header file).
- Automatically copy (`scp`) saved files to remote destination.
- Generic
  [Call Hierarchy](https://code.visualstudio.com/updates/v1_33#_call-hierarchy)
  _provider_ for any language and supports _"Go to definition"_ and _"Go to
  symbol"_ LSP features.
- _Fix color theme for current workspace_ - useful when sharing same
  workspace/folder config file between multiple work trees and having different
  color themes for each tree.
- [Ctags](https://ctags.io/) support for document outline and local symbol
  jumps.
- Extract string from diagnostics (e.g. ESLint rule names) and add them to
  auto-completion.
- Document edit history - select previously edited/inserted text.
- Relative line navigation - similarly to VIM's
  [relativenumber](http://vimdoc.sourceforge.net/htmldoc/options.html#'relativenumber')
  jump a number of lines up/down with `Ctrl + <number>` and `Alt + <number>`.
  This involes auto-generating `keybindings` section in `package.json`.
- [GNU Global (gtags)](https://www.gnu.org/software/global/) support including
  _definition_ and _workspace symbols_ providers. There is also a custom
  QuickPick based implemenation of _Go to symbol in workspace..._ command that
  is MUCH faster than native one and is actually usable.
- VIM-like
  [jumplist](http://vimdoc.sourceforge.net/htmldoc/motion.html#jumplist). It's
  not secret and forward/backward navigation in VScode is not ideal as it
  "remembers" even unimportant jumps such as page up/down or find results
  navigation. This is an attempt to remember only import jumps (e.g.
  definition/reference jumps) for faster navigation.
- Conveniently deselect of specific selection in _multiple cursors_.
- Quickly rerun previous definition/references search.
- Mark selected text with `Ctrl+C`, swap _marked_ text with selection.
- Quickly navigate to adjacent functions using peek view.
- Edit remote files over SSH (kind of Emacs's
  [Tramp](https://www.gnu.org/software/tramp/)) by using
  [virtual filesystem provider](https://code.visualstudio.com/api/references/vscode-api#FileSystemProvider).

# Code organization and internal tooling

As
