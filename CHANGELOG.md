# Change Log

All notable changes to the "VS Code as Git Mergetool" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1] - 2020-08-25
### Added
- Layouts: 3DiffToBase, 4TransferRight, 4TransferDown
- Scroll position synchronization using the NPM package `diff`
- Settings configuration assistant
- Provides commands for launching/continuing/stopping `git mergetool`
- Optionally opens the Git commit message for committing after a successful `git mergetool` execution (as a workaround for some Git extension bugs).
- Provides a command for `git merge --abort` and `git merge --quit`.
- Disables line numbers and sets diff layout to “inline”
  while a diff layout is active

[Unreleased]: https://github.com/zawys/vscode-as-git-mergetool/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/zawys/vscode-as-git-mergetool/releases/tag/v0.0.1
