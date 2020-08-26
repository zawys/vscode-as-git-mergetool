<div align="center">
<img width="64" height="64" src="./media/icon.png">

# VS Code as Git Mergetool
</div>

This extension provides diff editor layouts for 3-way merges
directly in VS Code.

![Four pane merge](./media/four%20pane%20merge.png)

[Demo screencast](./media/unpackaged/demo.mp4)

## Features

- Assists in setting up suitable Git and VS Code configuration options,
  which allows that VS Code is invoked
  when an external `git mergetool` is executed.
- Shows a 3- or 4-pane diff layout when VS Code opens a merge situation.
- Synchronizes the scroll position of the files according to a text diff.
- Provides commands for launching/continuing/stopping `git mergetool`.
- Optionally opens the Git commit message in an editor
  after a successful `git mergetool` execution
  (as a workaround for few Git extension bugs).
- Provides a command for `git merge --abort` and `git merge --quit`.

At time of release this has been tested only on my Linux machine,
so especially Windows and MacOS users are welcomed
to report any compatibility issues. See [Contribute](#Contribute).


## Known issues

- When you have an file with conflicts opened,
  start a diff layout for that file and stop the diff layout,
  then it may happen that the originally opened editor is closed
  and a diff editor remains instead.
  This is due to a limitation of VS Code that editors seem to be recreated
  when previously covered by other editors and
  then there is no reliable way to find out who the editor belongs to.

  **TLDR**: Use the command “Deactivate diff layout” or `Ctrl+W`
  to stop the diff editor layout.

## Build

1. [Install Yarn globally](https://classic.yarnpkg.com/en/docs/install)
2. `yarn`
3. `yarn run package`

  The generated VSIX should then be in `packages/`.

## Contribute

Feel free to file feature requests and bug reports
[on GitHub](https://github.com/zawys/vscode-as-git-mergetool/issues).

### Development environment setup

Run the steps listed in [section Build](#Build).

Additionally, see the
[VSC Extension Quickstart](./vsc-extension-quickstart.md).

You probably also want to install
[VS Code Insiders](https://code.visualstudio.com/insiders/) to run the tests,
see [reason](https://code.visualstudio.com/api/working-with-extensions/testing-extension#using-insiders-version-for-extension-development).

## Further info

- [Change log](./CHANGELOG.md)
