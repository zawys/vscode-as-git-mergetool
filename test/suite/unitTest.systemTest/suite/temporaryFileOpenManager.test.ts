// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { Uri } from "vscode";
import { createReadonlyDocumentProviderManager } from "../../../../src/readonlyDocumentProvider";
import { DiffedURIs } from "../../../../src/diffedURIs";
import { TemporaryFileOpenManager } from "../../../../src/temporaryFileOpenManager";
import { DiffLayouterManager } from "../../../../src/diffLayouterManager";
import assert = require("assert");

suite("getDiffedURIs", () => {
  const readonlyScheme = createReadonlyDocumentProviderManager().scheme;

  const temporaryFileOpenManager = new TemporaryFileOpenManager(
    {} as DiffLayouterManager,
    createReadonlyDocumentProviderManager().documentProvider
  );
  // eslint-disable-next-line unicorn/consistent-function-scoping
  const sut = (uri: Uri): DiffedURIs | undefined =>
    temporaryFileOpenManager.getDiffedURIs(uri);

  test("returns correct paths for the diffed files", () => {
    const input = Uri.file("/somewhere/to_merge_BASE_12345.txt");
    const actual = sut(input);
    const expected: DiffedURIs = new DiffedURIs(
      Uri.file("/somewhere/to_merge_BASE_12345.txt"),
      Uri.file("/somewhere/to_merge_LOCAL_12345.txt"),
      Uri.file("/somewhere/to_merge_REMOTE_12345.txt"),
      Uri.file("/somewhere/to_merge.txt"),
      Uri.file("/somewhere/to_merge_BACKUP_12345.txt")
    );
    assert(actual?.equals(expected));
  });

  test("returns correct paths for the diffed files with .git extension", () => {
    const input = Uri.file("/somewhere/to_merge_BASE_12345.txt.git");
    const actual = sut(input);
    const expected: DiffedURIs = new DiffedURIs(
      Uri.file("/somewhere/to_merge_BASE_12345.txt"),
      Uri.file("/somewhere/to_merge_LOCAL_12345.txt"),
      Uri.file("/somewhere/to_merge_REMOTE_12345.txt"),
      Uri.file("/somewhere/to_merge.txt"),
      Uri.file("/somewhere/to_merge_BACKUP_12345.txt")
    );
    assert(actual?.equals(expected));
  });

  test("the returned paths have file or readonly-file scheme respectively", () => {
    const input = Uri.file("/somewhere/to_merge_BASE_12345.txt.git").with({
      scheme: "git",
    });
    const actual = sut(input);
    assert.strictEqual(actual?.base.scheme, readonlyScheme, "base");
    assert.strictEqual(actual?.local.scheme, readonlyScheme, "local");
    assert.strictEqual(actual?.remote.scheme, readonlyScheme, "remote");
    assert.strictEqual(actual?.merged.scheme, "file", "merged");
    assert.strictEqual(actual?.backup?.scheme, readonlyScheme, "merged");
  });

  test("return valid paths when other capitals part is input", () => {
    const input = Uri.file("/somewhere/to_merge_LOCAL_12345.txt");
    const actual = sut(input);
    const expected: DiffedURIs = new DiffedURIs(
      Uri.file("/somewhere/to_merge_BASE_12345.txt"),
      Uri.file("/somewhere/to_merge_LOCAL_12345.txt"),
      Uri.file("/somewhere/to_merge_REMOTE_12345.txt"),
      Uri.file("/somewhere/to_merge.txt"),
      Uri.file("/somewhere/to_merge_BACKUP_12345.txt")
    );
    assert(actual?.equals(expected));
  });
});
