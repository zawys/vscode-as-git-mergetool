import * as diff from 'diff';
import * as vscode from 'vscode';
import { Disposable } from "vscode";
import { getStats } from "./fsAsync";
import { extensionID } from "./iDs";
import { defaultVSCodeConfigurator } from "./vSCodeConfigurator";

export class ScrollSynchronizer implements Disposable {
  public dispose() {
    for (const disposable of this.disposables) { disposable.dispose(); }
  }

  public static async create(
    editors: vscode.TextEditor[],
    synchronizationSourceOnStartIndex?: number,
    vSCodeConfigurator = defaultVSCodeConfigurator,
    synchronizationMethod?: ScrollSyncMethod,
  ): Promise<ScrollSynchronizer> {
    const ignoreEditor = new Array<number>(editors.length).fill(
      synchronizationSourceOnStartIndex === undefined ? 0 : 1
    );
    if (synchronizationSourceOnStartIndex !== undefined) {
      ignoreEditor[synchronizationSourceOnStartIndex] = 0;
    }
    if (synchronizationMethod === undefined) {
      const setting = vSCodeConfigurator.get(scrollSynchronizationMethod);
      synchronizationMethod = ScrollSyncMethod.interval;
      if (typeof setting === "string") {
        const mapped = scrollSynchronizationMethodMap[setting];
        if (mapped !== undefined) {
          synchronizationMethod = mapped;
        }
      }
    }
    const surroundingLines =
      vSCodeConfigurator.get(cursorSurroundingLinesSettingID);
    const scrollSynchronizer = new ScrollSynchronizer(
      editors,
      ignoreEditor,
      synchronizationMethod,
      typeof surroundingLines === 'number' ? surroundingLines : 0,
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
  private readonly documents: vscode.TextDocument[];
  /**
   * When was the respective `ignoreEditor` index updated last?
   */
  private readonly lastIgnoreChange: number[];
  private readonly editorLinesCache: (undefined | string[])[];
  private readonly mappersCache: {
    [k0: number]: undefined | {
      [k1: number]: undefined | LineMapper
    }
  } = {};

  private constructor(
    private readonly editors: vscode.TextEditor[],
    private readonly ignoreEditor: number[],
    private readonly syncMethod: ScrollSyncMethod,
    private surroundingLines: number,
    private readonly startPosCorrection = surroundingLines - 0.5,
    private readonly centerPosCorrection = +0.25,
    private readonly endPosCorrection = 0,
    private readonly eventDecayPerSec = 0.25,
  ) {
    this.editorLinesCache =
      new Array<undefined>(editors.length).fill(undefined);
    this.lastIgnoreChange = new Array<number>(editors.length).fill(0);
    this.documents = this.editors.map(editor => editor.document);

    this.disposables.push(vscode.window.onDidChangeTextEditorVisibleRanges(
      this.handleDidChangeTextEditorVisibleRanges.bind(this)
    ));
    this.disposables.push(vscode.workspace.onDidChangeTextDocument(
      this.handleDidChangeTextDocument.bind(this)
    ));
  }

  private async syncVisibleRanges(
    sourceEditor: vscode.TextEditor,
    sourceEditorIndex: number,
  ): Promise<void> {
    if (this.editors[sourceEditorIndex] !== sourceEditor) {
      vscode.window.showErrorMessage("internal assumption violated");
      return;
    }

    const visibleRanges = sourceEditor.visibleRanges;
    // positions are cursors, lines are indexes
    let sourceStartPos = Number.MAX_SAFE_INTEGER;
    let sourceEndPos = 0;
    for (let i = 0; i < visibleRanges.length; i++) {
      const range = visibleRanges[i];
      const rangeStart = range.start.line;
      if (sourceStartPos > rangeStart) { sourceStartPos = rangeStart; }
      if (this.syncMethod !== ScrollSyncMethod.top) {
        const rangeEnd = range.end.line + 1;
        if (sourceEndPos < rangeEnd) { sourceEndPos = rangeEnd; }
      }
    }
    let sourceSyncPos = -1;
    let sourceSyncFraction = -1;
    if (this.syncMethod !== ScrollSyncMethod.interval) {
      // duplicate below
      sourceSyncPos =
        this.syncMethod === ScrollSyncMethod.top ?
          sourceStartPos :
          (sourceStartPos + sourceEndPos) / 2;
      sourceSyncFraction =
        sourceSyncPos / Math.max(1, sourceEditor.document.lineCount);
    }
    const revealType =
      this.syncMethod === ScrollSyncMethod.top ?
        vscode.TextEditorRevealType.AtTop :
        vscode.TextEditorRevealType.InCenter;
    for (
      let targetEditorIndex = 0;
      targetEditorIndex < this.editors.length;
      targetEditorIndex++
    ) {
      if (targetEditorIndex === sourceEditorIndex) { continue; }
      const targetEditor = this.editors[targetEditorIndex];
      const targetMaxLine = targetEditor.document.lineCount - 1;
      let targetRange: vscode.Range | undefined;
      if (this.syncMethod === ScrollSyncMethod.interval
      ) {
        const targetStartPos = await this.translatePosition(
          sourceStartPos, sourceEditorIndex, targetEditorIndex
        );
        const targetEndPos = await this.translatePosition(
          sourceEndPos, sourceEditorIndex, targetEditorIndex
        );
        if (targetStartPos !== undefined && targetEndPos !== undefined) {
          targetRange = new vscode.Range(
            new vscode.Position(Math.min(targetMaxLine, Math.max(0, Math.round(
              targetStartPos + this.startPosCorrection
            ))), 0),
            new vscode.Position(Math.min(targetMaxLine, Math.max(0, Math.round(
              targetEndPos - 1 + this.endPosCorrection
            ))), 0)
          );
        }
      }
      if (targetRange === undefined) {
        if (sourceSyncFraction === -1) {
          // duplicate above
          sourceSyncPos =
            this.syncMethod === ScrollSyncMethod.top ?
              sourceStartPos :
              (sourceStartPos + sourceEndPos) / 2;
          sourceSyncFraction =
            sourceSyncPos / Math.max(1, sourceEditor.document.lineCount);
        }
        let targetPos = await this.translatePosition(
          sourceSyncPos, sourceEditorIndex, targetEditorIndex
        );
        if (targetPos === undefined) {
          console.log("targetPosition === undefined");
          targetPos = sourceSyncFraction * targetEditor.document.lineCount;
        }
        const targetLine =
          this.syncMethod === ScrollSyncMethod.center ?
            Math.min(targetMaxLine, Math.max(0, Math.round(
              targetPos - 0.5 + this.centerPosCorrection
            ))) :
            // also for ScrollSyncMethod.interval
            Math.min(targetMaxLine, Math.max(this.surroundingLines, Math.round(
              targetPos + this.startPosCorrection
            )));
        if (this.syncMethod === ScrollSyncMethod.top) {
          const targetEditorActualLine =
            targetEditor.visibleRanges[0].start.line;
          if (targetEditorActualLine === targetLine - this.surroundingLines) {
            continue;
          }
        }
        const targetVSCPosition = new vscode.Position(targetLine, 0);
        targetRange = new vscode.Range(targetVSCPosition, targetVSCPosition);
      }
      this.updatedIgnore(targetEditorIndex);
      this.ignoreEditor[targetEditorIndex]++;
      targetEditor.revealRange(targetRange, revealType);
    }
  }

  private updatedIgnore(index: number): number {
    const time = new Date().getTime();
    const result =
      Math.pow(this.eventDecayPerSec, Math.min(20,
        (time - this.lastIgnoreChange[index]) / 1000
      )) * this.ignoreEditor[index];
    this.ignoreEditor[index] = result;
    this.lastIgnoreChange[index] = time;
    return result;
  }

  private async handleDidChangeTextEditorVisibleRanges(
    { textEditor /*, visibleRanges */ }:
      vscode.TextEditorVisibleRangesChangeEvent,
  ): Promise<void> {
    const editorIndex = this.editors.indexOf(textEditor);
    if (editorIndex === -1) { return; }
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

export enum ScrollSyncMethod {
  center,
  top,
  interval
}

export const scrollSynchronizationMethodMap:
  { [k: string]: ScrollSyncMethod | undefined }
  = {
  "center": ScrollSyncMethod.center,
  "top": ScrollSyncMethod.top,
  "interval": ScrollSyncMethod.interval,
};

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

const cursorSurroundingLinesSettingID =
  "editor.cursorSurroundingLines";
const scrollSynchronizationMethod =
  `${extensionID}.scrollSynchronizationMethod`;
