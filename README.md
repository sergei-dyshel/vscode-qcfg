# Intro

This is my personal VScode extension I'm constantly developing in my spare time.
It does not focus on specific functionality but rather acts as big collections
of shortcuts, macros, tips and tricks I've accumulated over time. Some of them
are simple and polished, others are very hacky and at experimental stage.

The functionality of this extension is very tweaked to my taste and hence not
suitable for general use. It also uses some scripts from my personal _dotfiles_
repo (private at the moment). However many ideas deserve to be extracted into
full-featured plugins and I will be extremely happy to see my ideas borrowed,
polished, improved and expanded.

# Background

Coming from strong VIM background and being a customization freak I once
understood that maintaining a large VIM configuration (to turn VIM into IDE)
became too unbearable and unpleasant, for many reasons.

So I had to make a choice between Emacs (obvious candidate) and a "modern"
extensible editor such as VScode or Atom. Despite Emacs being known as a "king"
of customization I decided to give VScode a try for various reason and I do not
regret.

Just as Emacs power user maintains his large `~/.emacs.d/` config I package all
my custom functionality in this extension. This repo is a live example to
demonstrate that VScode is perfectly valid choice for software developers who
want to invest heavily into their most used tool - the EDITOR.

Emacs adepts usually describe writing _Emacs lisp_ as pure joy and fun compared
to mainstream procedural/OOP languages but still I think Typescript/Node
infrastructure has some pretty big practical advantages:

- Typescript with first-class LSP IDE-like language support in VScode itself.
  While good language support may be not needed for simple editing macros its
  crucial for big feature development. I would argue that it would be much
  easier to develop and maintain something like _Magit_ in Typescript than
  ELisp.
- Just the debugging support is something I was dreaming about when trying to
  find errors in my 10K LOC VIM config :). I know the situation is much better
  in Emacs but IMO nothing can beat proper visual debugger with convenient
  conditional breakpoints, value preview hovers etc.
- Rich collection of Node.JS packages. Anything may imagine. Try integrating
  _Tree-sitter_ with ELisp!
- Separate _installation_ required for extension to make it work. While some may
  find this additional step as downside as in VIM or Emacs one just needs to
  edit text files and reload editor I see it as big plus: if you make some logic
  bug if will not be applied immediately to your current (after reload) and
  future editor sessions. So you can use stable version of extension while
  developing next version in the same Git repository. Then instantly you can
  test new code in a sandboxed editor window.

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
  [relativenumber](http://vimdoc.sourceforge.net/htmldoc/options.html#'relativenumber').
  jump a number of lines up/down with `Ctrl + <number>` and `Alt + <number>`.
  This involves auto-generating `keybindings` section in `package.json`.
- [GNU Global (gtags)](https://www.gnu.org/software/global/) support including
  _definition_ and _workspace symbols_ providers. There is also a custom
  QuickPick based implementation of _Go to symbol in workspace..._ command that
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

Some advanced feature to help managing alone such a big repository:

## Modules

The extension functionality is divided into _modules_ each module implemented in
separate file or subdirectory. Each modules has its own `activate()` function
and registers itself. When some modules depends (imports) another module they
will be activated in a proper order.

## Split `package.json`

Maintaining large `package.json` is not easy and very error-prone. Instead I use
separate JSON files per feature, each one containing feature-specific
configuration, commands and bindings. This approach allows making some parts
auto-generated by some script. Individual JSONs are merged together by
[deepmerge](https://www.npmjs.com/package/deepmerge) package.

## Format, Lint, Build

Webpack is a MUST for such a big config. I use a pretty standard webpack
[config](webpack.config.ts) with some quirks needed for support of
native-compiled Node modules. The code is auto-formatted with Prettier
([config](.prettierrc.json)). I also use rather verbose
[ESLint config](.eslintrc.js) for linting.

## Custom logging framework

I use pretty verbose logging to help me quickly diagnose the problems without
using debugger too much. I had to create custom logging framework to answer my
needs. Beyond common features usually found in logging frameworks it has some
nice and/or VScode-specific stuff I haven't found elsewhere:

- Log is dumped to VScode output channel AND file at different configurable log
  levels.
- VScode output channel has a dedicated syntax highlighting theme which is only
  used for this channel.
- Optional python-like formatting using
  [string-format](https://www.npmjs.com/package/string-format) package.
- Log callsite in _Typescript_ code using
  [source-map-support](https://www.npmjs.com/package/source-map-support) and
  [callsites](https://www.npmjs.com/package/callsites) packages.

## Error handling

While errors during commands are shown to use in popup notification boxes, there
are many cases where exception raised in code or rejected promise are just
printed to debug console without notifying user:

- VScode event listeners.
- VScode and Node API callbacks.

I care to wrap all command registration, event handler and API callbacks with
custom error handlers which show popup notification. Some errors are not
critical (like command precondition) and are shown in a less intrusive in status
bar.

# Troubleshooting

## Requesting Accessibility on MacOS

The dialog box asks to request accessibility for
`Code - OSS Helper (Renderer).app`. The app is not in `/Applications` but in
`/Applications/Code - OSS.app/Contents/Frameworks/Code - OSS Helper (Renderer).app`.

One way to select it is to use "Go to location" by pressing `Cmd+Shift+G`.

# Future plans

- More features!
- Code structure reorganization.
- Comments, docstrings.

---

Enjoy!
