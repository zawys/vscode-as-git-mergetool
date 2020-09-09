// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as assert from "assert";

import * as vscode from "vscode";
import * as diffedURIs from "../../../../src/diffedURIs";
import { readonlyScheme } from "../../../../src/readonlyDocumentProvider";

suite("parseBaseFileNameRE", () => {
  const sut: RegExp = diffedURIs.parseBaseFileNameRE;

  test("parses base file URI correctly", () => {
    const input = vscode.Uri.file("/example/changed_BASE_13546.xml");
    const actual = sut.exec(input.path);
    assert(actual, "matches");
    assert(actual[1] === "changed", "file name group value");
    assert(actual[2] === "BASE", "restWOGit group value");
    assert(actual[3] === "13546.xml", "restWOGit group value");
    assert(actual[4] === ".xml", "extension group value");
  });

  test("parses base file URI with .git extension correctly", () => {
    const input = vscode.Uri.file("/example/changed_BASE_13546.xml.git");
    const actual = sut.exec(input.path);
    assert(actual, "matches");
    assert(actual[1] === "changed", "file name group value");
    assert(actual[3] === "13546.xml", "restWOGit group value");
    assert(actual[4] === ".xml", "extension group value");
  });

  test("parses base file URI with single digit correctly", () => {
    const input = vscode.Uri.file("/example/changed_BASE_9.xml");
    const actual = sut.exec(input.path);
    assert(actual, "matches");
    assert.strictEqual(actual[3], "9.xml", "restWOGit group value");
    assert.strictEqual(actual[4], ".xml", "extension group value");
  });

  test("parses base file URI with 6 digits correctly", () => {
    const input = vscode.Uri.file("/example/changed_BASE_123456.xml");
    const actual = sut.exec(input.path);
    assert(actual, "matches");
    assert.strictEqual(actual[3], "123456.xml", "restWOGit group value");
    assert.strictEqual(actual[4], ".xml", "extension group value");
  });

  test("parses base file URI with other capitals part correctly", () => {
    const input = vscode.Uri.file("/example/changed_REMOTE_13546.xml.git");
    const actual = sut.exec(input.path);
    assert(actual, "matches");
    assert(actual[1] === "changed", "file name group value");
    assert(actual[2] === "REMOTE", "restWOGit group value");
    assert(actual[3] === "13546.xml", "restWOGit group value");
    assert(actual[4] === ".xml", "extension group value");
  });
});

suite("getDiffedURIs", () => {
  // eslint-disable-next-line unicorn/consistent-function-scoping
  const sut = (uri: vscode.Uri): diffedURIs.DiffedURIs | undefined =>
    diffedURIs.getDiffedURIs(uri);

  test("returns correct paths for the diffed files", () => {
    const input = vscode.Uri.file("/somewhere/to_merge_BASE_12345.txt");
    const actual = sut(input);
    const expected: diffedURIs.DiffedURIs = new diffedURIs.DiffedURIs(
      vscode.Uri.file("/somewhere/to_merge_BASE_12345.txt"),
      vscode.Uri.file("/somewhere/to_merge_LOCAL_12345.txt"),
      vscode.Uri.file("/somewhere/to_merge_REMOTE_12345.txt"),
      vscode.Uri.file("/somewhere/to_merge.txt"),
      vscode.Uri.file("/somewhere/to_merge_BACKUP_12345.txt")
    );
    assert(actual?.equals(expected));
  });

  test("returns correct paths for the diffed files with .git extension", () => {
    const input = vscode.Uri.file("/somewhere/to_merge_BASE_12345.txt.git");
    const actual = sut(input);
    const expected: diffedURIs.DiffedURIs = new diffedURIs.DiffedURIs(
      vscode.Uri.file("/somewhere/to_merge_BASE_12345.txt"),
      vscode.Uri.file("/somewhere/to_merge_LOCAL_12345.txt"),
      vscode.Uri.file("/somewhere/to_merge_REMOTE_12345.txt"),
      vscode.Uri.file("/somewhere/to_merge.txt"),
      vscode.Uri.file("/somewhere/to_merge_BACKUP_12345.txt")
    );
    assert(actual?.equals(expected));
  });

  test("the returned paths have file or readonly-file scheme respectively", () => {
    const input = vscode.Uri.file(
      "/somewhere/to_merge_BASE_12345.txt.git"
    ).with({ scheme: "git" });
    const actual = sut(input);
    assert.strictEqual(actual?.base.scheme, readonlyScheme, "base");
    assert.strictEqual(actual?.local.scheme, readonlyScheme, "local");
    assert.strictEqual(actual?.remote.scheme, readonlyScheme, "remote");
    assert.strictEqual(actual?.merged.scheme, "file", "merged");
    assert.strictEqual(actual?.backup?.scheme, readonlyScheme, "merged");
  });

  test("return valid paths when other capitals part is input", () => {
    const input = vscode.Uri.file("/somewhere/to_merge_LOCAL_12345.txt");
    const actual = sut(input);
    const expected: diffedURIs.DiffedURIs = new diffedURIs.DiffedURIs(
      vscode.Uri.file("/somewhere/to_merge_BASE_12345.txt"),
      vscode.Uri.file("/somewhere/to_merge_LOCAL_12345.txt"),
      vscode.Uri.file("/somewhere/to_merge_REMOTE_12345.txt"),
      vscode.Uri.file("/somewhere/to_merge.txt"),
      vscode.Uri.file("/somewhere/to_merge_BACKUP_12345.txt")
    );
    assert(actual?.equals(expected));
  });
});
