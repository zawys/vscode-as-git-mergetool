// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as assert from "assert";
import { Uri } from "vscode";

import * as diffedURIs from "../../../../src/diffedURIs";

suite("parseBaseFileNameRE", () => {
  const sut: RegExp = diffedURIs.parseBaseFileNameRE;

  test("parses base file URI correctly", () => {
    const input = Uri.file("/example/changed_BASE_13546.xml");
    const actual = sut.exec(input.path);
    assert(actual, "matches");
    assert(actual[1] === "changed", "file name group value");
    assert(actual[2] === "BASE", "restWOGit group value");
    assert(actual[3] === "13546.xml", "restWOGit group value");
    assert(actual[4] === ".xml", "extension group value");
  });

  test("parses base file URI with .git extension correctly", () => {
    const input = Uri.file("/example/changed_BASE_13546.xml.git");
    const actual = sut.exec(input.path);
    assert(actual, "matches");
    assert(actual[1] === "changed", "file name group value");
    assert(actual[3] === "13546.xml", "restWOGit group value");
    assert(actual[4] === ".xml", "extension group value");
  });

  test("parses base file URI with single digit correctly", () => {
    const input = Uri.file("/example/changed_BASE_9.xml");
    const actual = sut.exec(input.path);
    assert(actual, "matches");
    assert.strictEqual(actual[3], "9.xml", "restWOGit group value");
    assert.strictEqual(actual[4], ".xml", "extension group value");
  });

  test("parses base file URI with 6 digits correctly", () => {
    const input = Uri.file("/example/changed_BASE_123456.xml");
    const actual = sut.exec(input.path);
    assert(actual, "matches");
    assert.strictEqual(actual[3], "123456.xml", "restWOGit group value");
    assert.strictEqual(actual[4], ".xml", "extension group value");
  });

  test("parses base file URI with other capitals part correctly", () => {
    const input = Uri.file("/example/changed_REMOTE_13546.xml.git");
    const actual = sut.exec(input.path);
    assert(actual, "matches");
    assert(actual[1] === "changed", "file name group value");
    assert(actual[2] === "REMOTE", "restWOGit group value");
    assert(actual[3] === "13546.xml", "restWOGit group value");
    assert(actual[4] === ".xml", "extension group value");
  });
});
