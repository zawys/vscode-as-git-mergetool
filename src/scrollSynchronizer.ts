import { Disposable } from "vscode";
import * as vscode from 'vscode';
import * as diff from 'diff';
import { defaultVSCodeConfigurator, VSCodeConfigurator } from "./vSCodeConfigurator";
import { getStats } from "./fsAsync";

export class ScrollSynchronizer implements Disposable {
  public dispose() {
    for (const disposable of this.disposables) { disposable.dispose(); }
  }

  public static async create(
    editors: vscode.TextEditor[],
    synchronizationSourceOnStartIndex?: number,
    vSCodeConfigurator = defaultVSCodeConfigurator,
  ): Promise<ScrollSynchronizer> {
    const ignoreEditor = new Array<number>(editors.length).fill(
      synchronizationSourceOnStartIndex === undefined ? 0 : 1
    );
    if (synchronizationSourceOnStartIndex !== undefined) {
      ignoreEditor[synchronizationSourceOnStartIndex] = 0;
    }
    const scrollSynchronizer = new ScrollSynchronizer(
      editors, vSCodeConfigurator, ignoreEditor,
    );
    if (synchronizationSourceOnStartIndex !== undefined) {
      await scrollSynchronizer.syncVisibleRanges(
        editors[synchronizationSourceOnStartIndex],
        synchronizationSourceOnStartIndex,
      );
    }
    return scrollSynchronizer;
  }

  private readonly disposables: Disposable[] = [];
  private lastScrollTime: number = 0;
  private surroundingLines: number;
  private readonly documents: vscode.TextDocument[];
  private readonly lastIgnoreChange: number[];
  private readonly editorLinesCache: (undefined | string[])[];
  private readonly mappersCache: {
    [k0: number]: undefined | {
      [k1: number]: undefined | LineMapper
    }
  } = {};

  private constructor(
    private readonly editors: vscode.TextEditor[],
    private readonly vSCodeConfigurator: VSCodeConfigurator,
    private readonly ignoreEditor: number[],
  ) {
    this.editorLinesCache =
      new Array<undefined>(editors.length).fill(undefined);
    this.lastIgnoreChange = new Array<number>(editors.length).fill(0);
    this.documents = this.editors.map(editor => editor.document);
    this.surroundingLines = this.vSCodeConfigurator.get<number>(
      cursorSurroundingLinesSettingID
    ) || 0;

    this.disposables.push(vscode.window.onDidChangeTextEditorVisibleRanges(
      this.handleDidChangeTextEditorVisibleRanges.bind(this)
    ));
    this.disposables.push(vscode.workspace.onDidChangeTextDocument(
      this.handleDidChangeTextDocument.bind(this)
    ));
    // this.channel.show();
    // this.channel.appendLine("-----");
  }

  private async syncVisibleRanges(
    sourceEditor: vscode.TextEditor,
    sourceEditorIndex: number,
  ): Promise<void> {
    // this.channel.appendLine(`start sync ${sourceEditorIndex}`);
    if (this.editors[sourceEditorIndex] !== sourceEditor) {
      vscode.window.showErrorMessage("internal assumption violated");
      return;
    }

    const visibleRanges = sourceEditor.visibleRanges;
    const sourcePosition = visibleRanges[0].start.line;
    const sourceFraction =
      sourcePosition / Math.max(1, sourceEditor.document.lineCount);

    for (
      let targetEditorIndex = 0;
      targetEditorIndex < this.editors.length;
      targetEditorIndex++
    ) {
      if (targetEditorIndex === sourceEditorIndex) { continue; }
      const targetEditor = this.editors[targetEditorIndex];
      let targetPosition = await this.translatePosition(
        sourcePosition,
        sourceEditorIndex,
        targetEditorIndex
      );
      if (targetPosition === undefined) {
        targetPosition = sourceFraction * targetEditor.document.lineCount;
      }
      const targetLine = Math.max(this.surroundingLines,
        Math.min(targetEditor.document.lineCount - 1,
          Math.round(targetPosition + this.surroundingLines - 0.3),
        )
      );
      const targetEditorActualLine =
        targetEditor.visibleRanges[0].start.line;
      // DEBUG
      // if (targetEditorIndex === 0) {
      //   this.channel.appendLine(
      //     `[${sourceEditorIndex} -> ${targetEditorIndex}`
      //     + `(${targetEditorActualLine}, `
      //     + `${this.ignoreEditor[targetEditorIndex]})] -> `
      //     + `[${sourcePosition} -> ${targetLine}]`
      //   );
      // }
      if (targetEditorActualLine === targetLine - this.surroundingLines) {
        continue;
      }
      const targetVSCPositon = new vscode.Position(targetLine, 0);
      this.updatedIgnore(targetEditorIndex);
      this.ignoreEditor[targetEditorIndex]++;
      targetEditor.revealRange(
        new vscode.Range(targetVSCPositon, targetVSCPositon),
        vscode.TextEditorRevealType.AtTop
      );
    }
    // this.channel.appendLine(`end sync ${sourceEditorIndex}`);
  }

  private updatedIgnore(index: number): number {
    const time = new Date().getTime();
    const result =
      Math.pow(decayPerSec, Math.min(20,
        (time - this.lastIgnoreChange[index]) / 1000
      )) * this.ignoreEditor[index];
    this.ignoreEditor[index] = result;
    this.lastIgnoreChange[index] = time;
    return result;
  }

  // DEBUG
  //private channel = vscode.window.createOutputChannel("scroll");

  private async handleDidChangeTextEditorVisibleRanges(
    { textEditor /*, visibleRanges */ }:
      vscode.TextEditorVisibleRangesChangeEvent,
  ): Promise<void> {
    const editorIndex = this.editors.indexOf(textEditor);
    if (editorIndex === -1) { return; }
    // this.channel.appendLine(`${editorIndex}, ${this.ignoreEditor}`)
    if (this.updatedIgnore(editorIndex) > 0.5) {
      this.ignoreEditor[editorIndex]--;
      return;
    }
    await this.syncVisibleRanges(textEditor, editorIndex);
  }

  private handleDidChangeTextDocument(e: vscode.TextDocumentChangeEvent) {
    const editorCount = this.editors.length;
    for (var index = 0; index < editorCount; index++) {
      if (this.documents[index] !== e.document) { continue; }

      this.editorLinesCache[index] = undefined;

      this.mappersCache[index] = undefined;
      for (var i = 0; i < this.editors.length; i++) {
        const cacheValue0 = this.mappersCache[i];
        if (cacheValue0 !== undefined) {
          cacheValue0[index] = undefined;
        }
      }
    }
  }

  private async getLines(
    editorIndex: number, doc: vscode.TextDocument
  ): Promise<string[] | undefined> {
    let cacheValue = this.editorLinesCache[editorIndex];
    if (cacheValue === undefined) {
      this.editorLinesCache[editorIndex];
      const stats = await getStats(doc.fileName);
      if (stats === undefined || stats.size > 500000) { return undefined; }
      cacheValue = doc.getText().split(eolToString(doc.eol))
        .map(line => line.trim());
      this.editorLinesCache[editorIndex] = cacheValue;
    }
    return cacheValue;
  }

  private async getMapper(
    oldEditorIndex: number, newEditorIndex: number
  ): Promise<LineMapper | undefined> {
    if (oldEditorIndex === newEditorIndex) {
      return defaultIdentityLineMapper;
    }

    let cacheValue0 = this.mappersCache[oldEditorIndex];
    let cacheValue1 =
      cacheValue0 === undefined ? undefined : cacheValue0[newEditorIndex];

    if (cacheValue1 === undefined) {
      let cacheValue1Symm: LineMapper;
      const oldDoc = this.editors[oldEditorIndex].document;
      const newDoc = this.editors[newEditorIndex].document;
      if (oldDoc === newDoc) {
        cacheValue1 = defaultIdentityLineMapper;
        cacheValue1Symm = defaultIdentityLineMapper;
      } else {
        const oldLines = await this.getLines(oldEditorIndex, oldDoc);
        if (oldLines === undefined) { return undefined; }
        const newLines = await this.getLines(newEditorIndex, newDoc);
        if (newLines === undefined) { return undefined; }

        if (oldEditorIndex < newEditorIndex) {
          cacheValue1 = DiffLineMapper.create(oldLines, newLines);
          cacheValue1Symm = (cacheValue1 as DiffLineMapper).createReversed();
        } else {
          cacheValue1Symm = DiffLineMapper.create(newLines, oldLines);
          cacheValue1 = (cacheValue1Symm as DiffLineMapper).createReversed();
        }
      }

      if (cacheValue0 === undefined) {
        cacheValue0 = {};
        this.mappersCache[oldEditorIndex] = cacheValue0;
      };
      cacheValue0[newEditorIndex] = cacheValue1;

      let cacheValue0Symm = this.mappersCache[newEditorIndex];
      if (cacheValue0Symm === undefined) {
        cacheValue0Symm = {};
        this.mappersCache[newEditorIndex] = cacheValue0Symm;
      };
      cacheValue0Symm[oldEditorIndex] = cacheValue1Symm;
    }
    return cacheValue1;
  }

  private async translatePosition(
    position: number, oldEditorIndex: number, newEditorIndex: number
  ): Promise<number | undefined> {
    const mapper = await this.getMapper(oldEditorIndex, newEditorIndex);
    if (mapper !== undefined) { return mapper.map(position); }
  }
}

export function eolToString(eol: vscode.EndOfLine) {
  return eol === vscode.EndOfLine.LF ? '\n' : '\r\n';
}

export class DiffLineMapper implements LineMapper {
  public static create(
    oldLines: string[],
    newLines: string[]
  ): DiffLineMapper {
    const linesDiff = diff.diffArrays(oldLines, newLines);
    const mapping: MappingEntry[] = [];
    let currentOldIndex = 0;
    let currentNewIndex = 0;
    let noDeltaEnds = true;
    let commonStarts = false;
    let i = 0;
    let part: diff.ArrayChange<string>;
    while (true) {
      let push: boolean;
      if (i >= linesDiff.length) {
        push = true;
        i++;
      } else {
        part = linesDiff[i];
        i++;
        commonStarts = !part.added && !part.removed;
        push = noDeltaEnds || commonStarts;
      }
      if (push) {
        mapping.push({ oldLine: currentOldIndex, newLine: currentNewIndex });
      }
      if (i > linesDiff.length) { break; }
      // start switching perspective
      if (!part!.added) { currentOldIndex += part!.value.length; }
      if (!part!.removed) { currentNewIndex += part!.value.length; }
      noDeltaEnds = commonStarts;
      // end switching perspective
    }
    return new DiffLineMapper(
      mapping, false, currentOldIndex, currentNewIndex
    );
  }

  /**
   *
   * @param line may be a float.
   * @returns a float
   */
  public map(line: number): number {
    let minFromLine = 0;
    let maxFromLine = this.reversed ? this.newCount : this.oldCount;
    let minToLine = 0;
    let maxToLine = this.reversed ? this.oldCount : this.newCount;
    if (line < minFromLine) { return minToLine; }
    if (line > maxFromLine) { return maxToLine; }
    const mappingMaxIndex = this.mapping.length - 1;
    let minIndex = 0;
    let maxIndex = mappingMaxIndex;
    while (true) {
      if (minIndex + 1 >= maxIndex || minFromLine === maxFromLine) { break; }
      let nextIndex = Math.round(
        (line - minFromLine) /
        (maxFromLine - minFromLine) *
        (maxIndex - minIndex)
      );
      if (nextIndex <= minIndex) { nextIndex = minIndex + 1; }
      else if (nextIndex >= maxIndex) { nextIndex = maxIndex - 1; }
      const nextFromLine = this.getMappingFromLine(nextIndex);
      if (nextFromLine < line) {
        minIndex = nextIndex;
        minFromLine = nextFromLine;
      } else if (nextFromLine > line) {
        maxIndex = nextIndex;
        maxFromLine = nextFromLine;
      } else {
        for (
          minIndex = nextIndex - 1;
          minIndex >= 0
          && this.getMappingFromLine(minIndex) >= line;
          minIndex--
        ) { }
        minIndex++;
        for (
          maxIndex = nextIndex + 1;
          maxIndex <= mappingMaxIndex
          && this.getMappingFromLine(maxIndex) <= line;
          maxIndex++
        ) { }
        maxIndex--;
        minFromLine = this.getMappingFromLine(minIndex);
        maxFromLine = this.getMappingFromLine(maxIndex);
        break;
      }
    }
    minToLine = this.getMappingToLine(minIndex);
    maxToLine = this.getMappingToLine(maxIndex);
    if (maxFromLine === minFromLine) {
      return (maxToLine + minToLine) / 2;
    }
    return Math.min(maxToLine, Math.max(minToLine,
      (
        (line - minFromLine)
        / (maxFromLine - minFromLine)
        * (maxToLine - minToLine)
      )
      + minToLine
    ));
  }

  public createReversed(): DiffLineMapper {
    return new DiffLineMapper(
      this.mapping, !this.reversed, this.oldCount, this.newCount,
    );
  }

  private constructor(
    private readonly mapping: MappingEntry[],
    private readonly reversed: boolean,
    private readonly oldCount: number,
    private readonly newCount: number,
  ) { }

  private getMappingFromLine(index: number): number {
    return this.reversed ?
      this.mapping[index].newLine :
      this.mapping[index].oldLine;
  }

  private getMappingToLine(index: number): number {
    return this.reversed ?
      this.mapping[index].oldLine :
      this.mapping[index].newLine;
  }
}

const decayPerSec = 0.5;

class IdentityLineMapper implements LineMapper {
  map(line: number): number { return line; }
}

const defaultIdentityLineMapper = new IdentityLineMapper();

interface LineMapper {
  map(line: number): number;
}

interface MappingEntry {
  oldLine: number;
  newLine: number;
}

const cursorSurroundingLinesSettingID = "editor.cursorSurroundingLines";
