# Change Log

All notable changes to the "VS Code as Git Mergetool"
extension will be documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Keybindings: Most functionality is now available as keyboard shortcuts
  by first typing `shift+alt+m` and then a single letter.
- Powerful new command: “Start mergetool, go to next conflict, or do commit”.
  This combines several commands of the extension into one
  and guides through the whole merge process.
- Terminal process detached from renderer process,
  allowing to cleanly shut down `git mergetool` when VS Code is closed,
  deleting the temporary merge conflict files in the process.

### Changed

- Slight optimization of the speed of the diff layout stop

### Fixed

- Large reworking of the mergetool process management, fixing several bugs

## [0.3.0] - 2020-08-30

### Changed

- Scroll synchronization method by default is now the new “interval” method.
  The ID and meaning of the setting have changed
  and so the setting will be reset to the default.

### Added

- Scroll synchronization method “interval”
- Reset settings directly on VS Code startup
- Also disable glyph margin and activity bar during diff layout
- Merge arbitrary files: Allow to select an existing file for merge
- Message when no merge conflicts exist on opening a diff layout

### Fixed

- Change settings synchronously to prevent confused VS Code and congestion
- Several small bugs discovered thanks to stricter linting

## [0.2.2] - 2020-08-29

### Fixed

- Use the global storage instead of the workspace storage
  for restoring settings
- Wrong setting type declared for `scrollingSynchronizedAt`

## [0.2.1] - 2020-08-29

### Added

- Disable tabs during editor layout

### Fixed

- Automatic upload of releases

## [0.2.0] - 2020-08-28

### Added

- Command "Merge arbitrary files" showing a quick pick for file selection.
  This is available in the SCM panel title menu.
- Restoring of previous “line numbers” and “inline diff” settings
  even if VS Code was closed abruptly
- Option to synchronize the scroll position vertically at the center
- Short explanation for installation and usage in README.md
- More automated release process

### Changed

- Change temporary settings globally, not in workspace
- `yarn run package` → `yarn run build`

### Fixed

- Check for MERGE_MSG existence before opening it
- Spelling
- Null reference exception in DiffLineMapper

## [0.1.0] - 2020-08-27

### Added

- Reset merge file command is now always available
  when a diff layout is opened.
- Warn when closing a diff layout with a file containing conflict markers
  opened from outside of VS Code.

### Fixed

- Fix crash when starting a merge layout without opened workspace.
- More aggressively match editors when deactivating a diff layout.
  Recommended setting: auto save on.
- Use default foreground color for status bar items.
- Use colorless icon for skip command status bar item.

### Changed

- Use current Code executable path for Git config `mergetool.code.cmd`
- Some error messages were improved.

## [0.0.1] - 2020-08-26

### Added

- Layouts: 3DiffToBase, 4TransferRight, 4TransferDown
- Scroll position synchronization using the NPM package `diff`
- Settings configuration assistant
- Provides commands for launching/continuing/stopping `git mergetool`
- Optionally opens the Git commit message for committing
  after a successful `git mergetool` execution
  (as a workaround for some Git extension bugs).
- Provides a command for `git merge --abort` and `git merge --quit`.
- Disables line numbers and sets diff layout to “inline”
  while a diff layout is active

[unreleased]: https://github.com/zawys/vscode-as-git-mergetool/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.2.2
[0.2.1]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.2.1
[0.2.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.2.0
[0.1.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.1.0
[0.0.1]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.0.1
