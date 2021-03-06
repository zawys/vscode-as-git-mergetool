// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import { strictEqual } from "assert";
import { DiffLineMapper } from "../../../../src/scrollSynchronizer";

suite("DiffLineMapper", () => {
  test("works", () => {
    const testCases: {
      old: string;
      new: string;
      from: number;
      expectedTo: number;
    }[] = [
      { old: "abcd", new: "abcd", from: 0, expectedTo: 0 },
      { old: "abcd", new: "abcd", from: 3, expectedTo: 3 },
      { old: "a", new: "abcd", from: 0, expectedTo: 0 },
      { old: "ab", new: "abcd", from: 1, expectedTo: 1 },
      { old: "abd", new: "abcd", from: 2, expectedTo: 2.5 },
      { old: "abx", new: "abcde", from: 2, expectedTo: 2 },
      { old: "abx", new: "abcde", from: 2.5, expectedTo: 3.5 },
      { old: "abx", new: "abcde", from: 3, expectedTo: 5 },
      { old: "abcdef", new: "ce", from: 1, expectedTo: 0 },
      { old: "abcdef", new: "ce", from: 2, expectedTo: 0 },
      { old: "abcdef", new: "ce", from: 2.5, expectedTo: 0.5 },
      { old: "abcdef", new: "ce", from: 3.5, expectedTo: 1 },
      { old: "abcdef", new: "ce", from: 4.5, expectedTo: 1.5 },
      { old: "abcdef", new: "ce", from: 5.5, expectedTo: 2 },
      { old: "", new: "b", from: 0, expectedTo: 0.5 },
      { old: "a", new: "ba", from: 0, expectedTo: 0.5 },
      { old: "a", new: "ab", from: 1, expectedTo: 1.5 },
    ];
    for (const testCase of testCases) {
      const sut = DiffLineMapper.create(
        testCase.old.split(""),
        testCase.new.split("")
      );
      if (sut === undefined) {
        throw new Error("sut === undefined");
      }
      // eslint-disable-next-line unicorn/no-array-callback-reference
      const actual = sut.map(testCase.from);
      strictEqual(
        actual,
        testCase.expectedTo,
        `{ old: "${testCase.old}", new: "${testCase.new}", from: ${testCase.from}, expectedTo: ${testCase.expectedTo} }`
      );
    }
  });
});
