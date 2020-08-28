import * as assert from 'assert';

import * as vscode from 'vscode';
import { defaultVSCodeConfigurator, separateSmallestKey } from '../../vSCodeConfigurator';
import { hrtime } from 'process';
import { extensionID } from '../../iDs';

suite("separateSmallestKey", () => {
  const sut = separateSmallestKey;

  test('works correctly', () => {
    const testCases = [
      { input: "ab", expected: [undefined, "ab"] },
      { input: "ab.cd", expected: ["ab", "cd"] },
      { input: "ab.cd.ef", expected: ["ab.cd", "ef"] },
    ];
    for (const { input, expected } of testCases) {
      assert.deepEqual(sut(input), expected);
    }
  });
});

suite('VSCodeConfigurator', () => {
  const sut = defaultVSCodeConfigurator;

  test('persists settings', async () => {
    const key = `${extensionID}.layout`;
    const original = sut.get(key);
    {
      await sut.set(key, "3DiffToBase");
      const start = hrtime.bigint();
      const actual = sut.get(key);
      const end = hrtime.bigint();
      console.warn(`1. took: ${end - start}`);
      assert(end - start < 1*1000*1000, `1. took: ${end - start}ns`);
      assert.strictEqual(actual, "3DiffToBase");
    }
    {
      await sut.set(key, "4TransferDown");
      const start = hrtime.bigint();
      const actual = sut.get(key);
      const end = hrtime.bigint();
      console.warn(`2. took: ${end - start}`);
      assert(end - start < 1*1000*1000, `2. took: ${end - start}ns`);
      assert.strictEqual(actual, "4TransferDown");
    }
    sut.set(key, original);
  });
});
