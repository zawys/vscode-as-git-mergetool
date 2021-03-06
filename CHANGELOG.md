# Change Log

All notable changes to the "VS Code as Git Mergetool"
extension will be documented in this file.

The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Open the diff layout when opening a file containing conflicts
  being an alternative to the management through a `git mergetool` process
- Running the command “Git: Abort merge” now shows an error message
  when no merge is in progress.

### Changed

- Removed the spawning and controlling of `git mergetool` processes.
  The functionality of `git mergetool`
  is now contained in the extension’s own code
  which avoids the constant fragility of the integration.
- Tweaked the scrolling synchronizer so that one parameter less is required.
  That makes the scrolling synchronization slightly non-deterministic,
  but that should hopefully be not noticeable.
  It should be slightly more stable now.
- Switched to Webpack as bundler

## [0.14.0] - 2021-04-07

### Added

- Command to run the initial settings assistant on demand.

### Changed

- Initial settings assistant
  - Fixes. It now aggregates the decisions and allows to apply them at the end.
  - The settings assistant startup is now rather configured per repository.
  - Malfunctioning creation of backup setting entries
    was replaced by creating a log file of changes made.
  - The messages were improved.
- Switched to Webpack as bundler

### Fixed

- Wrong file paths were opened when `git mergetool` was launched
  by the extension.

## [0.13.3] - 2021-02-21

## Fixed

- Fixed ascertaining of the git path.
  The bug was introduced in 0.13.1 by a too aggressive search-and-replace.

## [0.13.2] - 2021-02-21

## Fixed

- Unfortunately, working around the bug mentioned in section 0.13.1
  unveiled that the parcel bundler seems to contain more bugs.
  Thus, for a quick&dirty fix, this release is the previous release
  with almost all dependencies as in version 0.11.0.
- Fixed command IDs.
  The bug was introduced in 0.13.1 by a too aggressive search-and-replace.

## [0.13.1] - 2021-02-21

### Fixed

- The extension went into an exception at runtime due to a
  [bug in the Parcel bundler](https://github.com/parcel-bundler/parcel/issues/5862).
  This prevented the extension from loading entirely.
  I did not notice this until I tried to use my extension myself
  because running the extension from the repository worked without flaws.
  So if you were disappointed, please consider creating a bug report next time.

### Internal

- Upgrade Husky

## [0.13.0] - 2021-02-06

### Added

- Save initially changed configuration values into backup entries

## [0.12.0] - 2021-02-06

### Fixed

- Texts of notifications from initial settings assistant

## [0.11.0] - 2020-12-19

### Added

- Layout `3DiffToMerged` diffing current, base, and remote to the merged version.
  This seems to be the best solution for merges
  where the changes in both versions are similar,
  e.g. for merging already partially cherry-picked branches
  or half-applied stashes.

### Changed

- Minor: Diff editor titles have been unified to always contain
  the name of the previous version of the comparison.

## [0.10.0] - 2020-09-09

### Changed

- The "next merge step" command introduced in [v0.4.0](#040---2020-08-30)
  is now assigned to the check mark button in the status bar.

## [0.9.0] - 2020-09-05

### Added

- Status bar items for zooming
- Make diffed files except merge result readonly.

## [0.8.0] - 2020-09-05

### Note

I have rebuilt and re-signed the packages of versions v0.6.0–v0.7.2
as in these packages were files which I did not want to publish.
As it is
[impossible to unpublish a specific version](https://github.com/microsoft/vscode-vsce/issues/176)
on the Marketplace,
I needed to temporarily completely purge the project from the Marketplace.
If—against my hope—that should have caused any trouble, please file an issue.

### Added

- *Zoom*: Quickly change the layout proportions using keyboard shortcuts:
  `shift+alt+m ↑`, `shift+alt+m ↓`, etc.; `shift+alt+m backspace` to reset.

## [0.7.3] - 2020-09-05

### Changed

- Bundle extension with [Parcel](https://v2.parceljs.org/)
- Include only necessary files in the package

## [0.7.2] - 2020-09-04

### Added

- Command “Switch diff layout temporarily…”; also available on the status bar.
  Reapplied from v0.7.0 with fixes.

### Fixed

- Diff editor layouts were being reopened on closing them
  when some extensions were enabled which caused additional “open” events.
- Prevent a seeming deadlock (“…other operation pending…”)
  by making the dialog asking for reset confirmation modal.

## [0.7.1] - 2020-09-04

### Fixed

- Reverted addition of command “Switch diff layout temporarily…”

## [0.7.0] - 2020-09-04

### Added

- Layout `3DiffToBaseMergedRight` with the merged file editor
  taking up the whole right half.
- Command “Switch diff layout temporarily…”; also available on the status bar
- Synchronization of the cursor position
- Command “Reset temporary settings activated on diff layout start”
  in case one has two VS Code instances open,
  activates a diff layout in one instance and simply closes it afterwards.

### Changed

- Merge the best of the scroll synchronization methods
  `centered` and `interval` into one, replacing them.

### Fixed

- Do not create a backup on close when the merged file is unchanged.

## [0.6.0] - 2020-09-03

This will be the first version published on the
[Marketplace](https://marketplace.visualstudio.com/items?itemName=zawys.vscode-as-git-mergetool).

### Added

- Layout `3DiffToBaseRows`, which is useful for long lines.
- Show message about `git commit` result.

### Changed

- Use node-pty to host `git mergetool` more reliably.

## [0.5.0] - 2020-09-01

### Added

- Asking for confirmation and creating a backup when skipping a file,
  as `git mergetool` automatically resets any changes made to the merged file
  when telling `git mergetool` that the merge was not successful.
- Also creating a backup when VS Code is closed
  while `git mergetool` is running.
- Showing by which number an editor is reachable in the title
  (reachable using `ctrl+<number>`)
- When `git mergetool` does not seem to respond, show the terminal.
  That way the other merge conflict types
  (symbolic links, directories and submodules)
  can be (with some care) managed.
- Prevent “Terminal process exited …” message from VS Code

### Changed

- Shorter editor titles

### Fixes

- Reopening the layout by using the start command failed
- Various issues with the process management

## [0.4.0] - 2020-08-30

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

[Unreleased]: https://github.com/zawys/vscode-as-git-mergetool/compare/v0.14.0...HEAD
[0.14.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.14.0
[0.13.3]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.13.3
[0.13.2]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.13.2
[0.13.1]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.13.1
[0.13.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.13.0
[0.12.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.12.0
[0.11.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.11.0
[0.10.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.10.0
[0.9.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.9.0
[0.8.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.8.0
[0.7.3]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.7.3
[0.7.2]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.7.2
[0.7.1]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.7.1
[0.7.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.7.0
[0.6.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.6.0
[0.5.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.5.0
[0.4.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.4.0
[0.3.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.3.0
[0.2.2]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.2.2
[0.2.1]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.2.1
[0.2.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.2.0
[0.1.0]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.1.0
[0.0.1]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.0.1
