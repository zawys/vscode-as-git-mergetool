import assert from "assert";
import { GitMergetoolReplacement } from "../../../../src/gitMergetoolReplacement";

suite("lsFilesURE", () => {
  const sut: RegExp = GitMergetoolReplacement.lsFilesURE;

  test("parses output correctly", () => {
    const input =
      "100644 3d5a36862e75d6cfc7007d6e90150b33a574a4fc 1	some synthetic/path";
    const actual = sut.exec(input);
    assert(actual !== null);
    assert.strictEqual((actual.groups || {})["mode"], "100644");
    assert.strictEqual(
      (actual.groups || {})["object"],
      "3d5a36862e75d6cfc7007d6e90150b33a574a4fc"
    );
    assert.strictEqual((actual.groups || {})["stage"], "1");
    assert.strictEqual((actual.groups || {})["path"], "some synthetic/path");
  });
});
