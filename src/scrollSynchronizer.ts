// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

import * as diff from "diff";
import * as vscode from "vscode";
import { Disposable } from "vscode";
import { getStats } from "./fsHandy";
import { extensionID } from "./iDs";
import { showInternalError } from "./showInternalError";
import { VSCodeConfigurator } from "./vSCodeConfigurator";

export class ScrollSynchronizer implements Disposable {
  public static async create(
    editors: vscode.TextEditor[],
    vSCodeConfigurator: VSCodeConfigurator,
    synchronizationSourceOnStartIndex: number | undefined,
    initiallyIgnoredScrollEvents: number,
    syncMethod: ScrollSyncMethod | undefined
  ): Promise<ScrollSynchronizer> {
    const scrollIgnoreCounts = new Array<number>(editors.length).fill(
      synchronizationSourceOnStartIndex === undefined
        ? 0
        : initiallyIgnoredScrollEvents
    );
    const selectionIgnoreCounts = new Array<number>(editors.length).fill(
      synchronizationSourceOnStartIndex === undefined ? 0 : 1
    );
    if (synchronizationSourceOnStartIndex !== undefined) {
      scrollIgnoreCounts[synchronizationSourceOnStartIndex] = 0;
      selectionIgnoreCounts[synchronizationSourceOnStartIndex] = 0;
    }
    if (syncMethod === undefined) {
      const setting = vSCodeConfigurator.get(scrollSynchronizationMethod);
      syncMethod = ScrollSyncMethod.centeredInterval;
      if (typeof setting === "string") {
        const mapped = scrollSynchronizationMethodMap[setting];
        if (mapped !== undefined) {
          syncMethod = mapped;
        }
      }
    }
    const surroundingLines = vSCodeConfigurator.get(
      cursorSurroundingLinesSettingID
    );
    const scrollSynchronizer = new ScrollSynchronizer(
      editors,
      scrollIgnoreCounts,
      selectionIgnoreCounts,
      syncMethod,
      typeof surroundingLines === "number" && surroundingLines > 0
        ? surroundingLines
        : 0,
      new Date().getTime()
    );
    if (synchronizationSourceOnStartIndex !== undefined) {
      await scrollSynchronizer.syncVisibleRanges(
        editors[synchronizationSourceOnStartIndex],
        synchronizationSourceOnStartIndex
      );
      await scrollSynchronizer.syncTextEditorSelection(
        editors[synchronizationSourceOnStartIndex],
        synchronizationSourceOnStartIndex
      );
    }
    return scrollSynchronizer;
  }

  private readonly disposables: Disposable[] = [];
  private readonly documents: vscode.TextDocument[];
  /**
   * When was the respective `scrollIgnoreCounts[index]` updated last?
   */
  private readonly scrollIgnoreDates: number[];
  private readonly selectionIgnoreDates: number[];
  private readonly editorLinesCache: (undefined | string[])[];
  private readonly mappersCache: {
    [k0: number]:
      | undefined
      | {
          [k1: number]: undefined | LineMapper;
        };
  } = {};

  private constructor(
    private readonly editors: vscode.TextEditor[],
    private readonly scrollIgnoreCounts: number[],
    private readonly selectionIgnoreCounts: number[],
    private readonly syncMethod: ScrollSyncMethod,
    private surroundingLines: number,
    initialDate: number,
    private readonly startPosCorrection = surroundingLines - 1.3,
    private readonly centerPosCorrection = +0.5,
    private readonly eventDecayPerSec = 0.25
  ) {
    this.editorLinesCache = new Array<undefined>(editors.length).fill(
      undefined
    );
    const createDateArray = () =>
      new Array<number>(editors.length).fill(initialDate);
    this.scrollIgnoreDates = createDateArray();
    this.selectionIgnoreDates = createDateArray();
    this.documents = this.editors.map((editor) => editor.document);

    this.disposables.push(
      vscode.window.onDidChangeTextEditorVisibleRanges(
        this.handleDidChangeTextEditorVisibleRanges.bind(this)
      ),
      vscode.workspace.onDidChangeTextDocument(
        this.handleDidChangeTextDocument.bind(this)
      ),
      vscode.window.onDidChangeTextEditorSelection(
        this.handleDidChangeTextEditorSelection.bind(this)
      )
    );
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async syncVisibleRanges(
    sourceEditor: vscode.TextEditor,
    sourceEditorIndex: number
  ): Promise<void> {
    // // !debug
    // console.log(`syncVisibleRanges(
    //   sourceEditorIndex: ${sourceEditorIndex}
    // )`);

    if (this.editors[sourceEditorIndex] !== sourceEditor) {
      showInternalError("this.editors[sourceEditorIndex] !== sourceEditor");
      return;
    }

    const visibleRanges = sourceEditor.visibleRanges;
    // positions are cursors, lines are indexes
    const [sourceStartPos, sourceEndPos] = this.getScrollStartAndEndPos(
      visibleRanges
    );
    let sourceSyncPos = -1;
    let sourceSyncFraction = -1;
    if (this.syncMethod !== ScrollSyncMethod.centeredInterval) {
      // duplicate below
      sourceSyncPos =
        this.syncMethod === ScrollSyncMethod.top
          ? sourceStartPos // the top of the line
          : (sourceStartPos + sourceEndPos) / 2; // syncing at the center
      sourceSyncFraction =
        sourceSyncPos / Math.max(1, sourceEditor.document.lineCount);
    }
    const revealType =
      this.syncMethod === ScrollSyncMethod.top
        ? vscode.TextEditorRevealType.AtTop
        : vscode.TextEditorRevealType.InCenter;
    for (
      let targetEditorIndex = 0;
      targetEditorIndex < this.editors.length;
      targetEditorIndex++
    ) {
      if (targetEditorIndex === sourceEditorIndex) {
        continue;
      }
      const targetEditor = this.editors[targetEditorIndex];
      const targetMaxLine = targetEditor.document.lineCount - 1;
      let targetRange: vscode.Range | undefined;

      if (this.syncMethod === ScrollSyncMethod.centeredInterval) {
        const mappedSourceStartPos =
          0.75 * sourceStartPos + 0.25 * sourceEndPos;
        const mappedSourceEndPos = 0.25 * sourceStartPos + 0.75 * sourceEndPos;
        const mappedDestinationStartPos = await this.translatePosition(
          mappedSourceStartPos,
          sourceEditorIndex,
          targetEditorIndex
        );
        const mappedDestinationEndPos = await this.translatePosition(
          mappedSourceEndPos,
          sourceEditorIndex,
          targetEditorIndex
        );
        if (
          mappedDestinationStartPos !== undefined &&
          mappedDestinationEndPos !== undefined
        ) {
          // rescale the mapped interval to the half size of the target editor
          const mappedIntervalCenter =
            (mappedDestinationEndPos + mappedDestinationStartPos) / 2;
          const [
            targetEditorStartPos,
            targetEditorEndPos,
          ] = this.getScrollStartAndEndPos(targetEditor.visibleRanges);
          const halfTargetIntervalSize =
            (targetEditorEndPos - targetEditorStartPos) / 4;
          const targetIntervalStartPos =
            mappedIntervalCenter - halfTargetIntervalSize;
          const targetIntervalEndPos =
            mappedIntervalCenter + halfTargetIntervalSize;

          const adaptedStartPos =
            targetIntervalStartPos + this.centerPosCorrection;
          const adaptedEndPos =
            targetIntervalEndPos + this.centerPosCorrection;
          targetRange = new vscode.Range(
            new vscode.Position(
              Math.min(
                targetMaxLine,
                Math.max(0, Math.round(adaptedStartPos))
              ),
              0
            ),
            new vscode.Position(
              Math.min(
                targetMaxLine,
                Math.max(0, Math.round(adaptedEndPos - 1))
              ),
              0
            )
          );
        }
      }

      if (targetRange === undefined) {
        if (sourceSyncFraction === -1) {
          // duplicate above
          sourceSyncPos =
            this.syncMethod === ScrollSyncMethod.top
              ? sourceStartPos // the top of the line
              : (sourceStartPos + sourceEndPos) / 2; // syncing at the center
          sourceSyncFraction =
            sourceSyncPos / Math.max(1, sourceEditor.document.lineCount);
        }
        let targetPos = await this.translatePosition(
          sourceSyncPos,
          sourceEditorIndex,
          targetEditorIndex
        );
        if (targetPos === undefined) {
          targetPos = sourceSyncFraction * targetEditor.document.lineCount;
        }
        const targetLine =
          this.syncMethod === ScrollSyncMethod.top
            ? Math.min(
                targetMaxLine,
                Math.max(
                  this.surroundingLines,
                  Math.round(targetPos + this.startPosCorrection)
                )
              )
            : Math.min(
                targetMaxLine,
                Math.max(0, Math.floor(targetPos + this.centerPosCorrection))
              );
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
      this.increaseIgnore(
        this.scrollIgnoreCounts,
        this.scrollIgnoreDates,
        targetEditorIndex
      );
      targetEditor.revealRange(targetRange, revealType);
    }
  }

  private getScrollStartAndEndPos(ranges: vscode.Range[]): [number, number] {
    let sourceStartPos = Number.MAX_SAFE_INTEGER;
    let sourceEndPos = 0;
    for (const range of ranges) {
      const rangeStart = range.start.line;
      if (sourceStartPos > rangeStart) {
        sourceStartPos = rangeStart;
      }
      if (this.syncMethod !== ScrollSyncMethod.top) {
        const rangeEnd = range.end.line + 1;
        if (sourceEndPos < rangeEnd) {
          sourceEndPos = rangeEnd;
        }
      }
    }
    return [sourceStartPos, sourceEndPos];
  }

  private updatedIgnore(
    ignoreCounts: number[],
    ignoreDates: number[],
    editorIndex: number
  ): number {
    const time = new Date().getTime();
    const result =
      Math.pow(
        this.eventDecayPerSec,
        Math.min(20, (time - ignoreDates[editorIndex]) / 1000)
      ) * ignoreCounts[editorIndex];
    ignoreCounts[editorIndex] = result;
    ignoreDates[editorIndex] = time;
    return result;
  }

  private decreaseIgnore(
    ignoreCounts: number[],
    ignoreDates: number[],
    editorIndex: number
  ): boolean {
    if (this.updatedIgnore(ignoreCounts, ignoreDates, editorIndex) > 0.5) {
      ignoreCounts[editorIndex]--;
      return true;
    }
    return false;

    // // !debug
    // const result =
    //   this.updatedIgnore(ignoreCounts, ignoreDates, editorIndex) > 0.5;
    // if (result) {
    //   ignoreCounts[editorIndex]--;
    // }
    // console.log(
    //   `decreaseIgnore(${
    //     this.scrollIgnoreCounts === ignoreCounts ? "scroll" : "selection"
    //   }, ${editorIndex}) === ${result ? "true" : "false"}`
    // );
    // return result;
  }

  private increaseIgnore(
    ignoreCounts: number[],
    ignoreDates: number[],
    editorIndex: number
  ): void {
    // // !debug
    // console.log(
    //   `increaseIgnore(${
    //     this.scrollIgnoreCounts === ignoreCounts ? "scroll" : "selection"
    //   }, ${editorIndex})`
    // );

    this.updatedIgnore(ignoreCounts, ignoreDates, editorIndex);
    ignoreCounts[editorIndex]++;
  }

  private async handleDidChangeTextEditorVisibleRanges({
    textEditor /*, visibleRanges */,
  }: vscode.TextEditorVisibleRangesChangeEvent): Promise<void> {
    const editorIndex = this.editors.indexOf(textEditor);
    if (editorIndex === -1) {
      return;
    }
    if (
      this.decreaseIgnore(
        this.scrollIgnoreCounts,
        this.scrollIgnoreDates,
        editorIndex
      )
    ) {
      return;
    }
    await this.syncVisibleRanges(textEditor, editorIndex);
  }

  private handleDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
    const editorCount = this.editors.length;
    for (let fromIndex = 0; fromIndex < editorCount; fromIndex++) {
      if (this.documents[fromIndex] !== event.document) {
        continue;
      }

      this.editorLinesCache[fromIndex] = undefined;

      this.mappersCache[fromIndex] = undefined;
      for (let toIndex = 0; toIndex < this.editors.length; toIndex++) {
        const cacheValue0 = this.mappersCache[toIndex];
        if (cacheValue0 !== undefined) {
          cacheValue0[fromIndex] = undefined;
        }
      }
    }
  }

  private async handleDidChangeTextEditorSelection(
    event: vscode.TextEditorSelectionChangeEvent
  ): Promise<void> {
    const sourceEditor = event.textEditor;
    const sourceEditorIndex = this.editors.indexOf(sourceEditor);
    if (sourceEditorIndex === -1) {
      return;
    }

    if (
      this.decreaseIgnore(
        this.selectionIgnoreCounts,
        this.selectionIgnoreDates,
        sourceEditorIndex
      )
    ) {
      return;
    }
    await this.syncTextEditorSelection(sourceEditor, sourceEditorIndex);
  }

  private async syncTextEditorSelection(
    sourceEditor: vscode.TextEditor,
    sourceEditorIndex: number
  ): Promise<void> {
    // // !debug
    // console.log(`syncTextEditorSelection(
    //   sourceEditorIndex: ${sourceEditorIndex}
    // )`);

    if (this.editors[sourceEditorIndex] !== sourceEditor) {
      showInternalError("this.editors[sourceEditorIndex] !== sourceEditor");
      return;
    }

    const sourcePosition = sourceEditor.selection.end.line + 0.5;
    const sourceCharacter = sourceEditor.selection.end.character;

    // // !debug
    // console.log(`sourcePosition: ${sourcePosition}`);

    for (
      let targetEditorIndex = 0;
      targetEditorIndex < this.editors.length;
      targetEditorIndex++
    ) {
      const targetEditor = this.editors[targetEditorIndex];
      if (!targetEditor.selection.isEmpty) {
        continue;
      }
      if (targetEditor !== sourceEditor) {
        const mappedPosition = await this.translatePosition(
          sourcePosition,
          sourceEditorIndex,
          targetEditorIndex
        );
        if (mappedPosition === undefined) {
          continue;
        }
        const mappedLine = Math.floor(mappedPosition);
        targetEditor.selection = new vscode.Selection(
          mappedLine,
          sourceCharacter,
          mappedLine,
          sourceCharacter
        );
        this.increaseIgnore(
          this.selectionIgnoreCounts,
          this.selectionIgnoreDates,
          targetEditorIndex
        );
      }
    }
  }

  private async getLines(
    editorIndex: number,
    document: vscode.TextDocument
  ): Promise<string[] | undefined> {
    let cacheValue = this.editorLinesCache[editorIndex];
    if (cacheValue === undefined) {
      this.editorLinesCache[editorIndex];
      const stats = await getStats(document.fileName);
      if (stats === undefined || stats.size > 500000) {
        return undefined;
      }
      cacheValue = document
        .getText()
        .split(eolToString(document.eol))
        .map((line) => line.trim());
      this.editorLinesCache[editorIndex] = cacheValue;
    }
    return cacheValue;
  }

  private async getMapper(
    oldEditorIndex: number,
    newEditorIndex: number
  ): Promise<LineMapper | undefined> {
    if (oldEditorIndex === newEditorIndex) {
      return defaultIdentityLineMapper;
    }

    let cacheValue0 = this.mappersCache[oldEditorIndex];
    let cacheValue1 =
      cacheValue0 === undefined ? undefined : cacheValue0[newEditorIndex];

    if (cacheValue1 === undefined) {
      let cacheValue1Symm: LineMapper | undefined;
      const oldDocument = this.editors[oldEditorIndex].document;
      const newDocument = this.editors[newEditorIndex].document;
      if (oldDocument === newDocument) {
        cacheValue1 = defaultIdentityLineMapper;
        cacheValue1Symm = defaultIdentityLineMapper;
      } else {
        const oldLines = await this.getLines(oldEditorIndex, oldDocument);
        if (oldLines === undefined) {
          return undefined;
        }
        const newLines = await this.getLines(newEditorIndex, newDocument);
        if (newLines === undefined) {
          return undefined;
        }

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
      }
      cacheValue0[newEditorIndex] = cacheValue1;

      let cacheValue0Symm = this.mappersCache[newEditorIndex];
      if (cacheValue0Symm === undefined) {
        cacheValue0Symm = {};
        this.mappersCache[newEditorIndex] = cacheValue0Symm;
      }
      cacheValue0Symm[oldEditorIndex] = cacheValue1Symm;
    }
    return cacheValue1;
  }

  private async translatePosition(
    position: number,
    oldEditorIndex: number,
    newEditorIndex: number
  ): Promise<number | undefined> {
    const mapper = await this.getMapper(oldEditorIndex, newEditorIndex);
    if (mapper === undefined) {
      return undefined;
    }
    // eslint-disable-next-line unicorn/no-fn-reference-in-iterator
    return mapper.map(position);
  }
}

export enum ScrollSyncMethod {
  top,
  centeredInterval,
}

export const scrollSynchronizationMethodMap: {
  [k: string]: ScrollSyncMethod | undefined;
} = {
  "centered interval": ScrollSyncMethod.centeredInterval,
  center: ScrollSyncMethod.centeredInterval,
  top: ScrollSyncMethod.top,
  interval: ScrollSyncMethod.centeredInterval,
};

export function eolToString(eol: vscode.EndOfLine): string {
  return eol === vscode.EndOfLine.LF ? "\n" : "\r\n";
}

export class DiffLineMapper implements LineMapper {
  public static create(
    oldLines: string[],
    newLines: string[]
  ): DiffLineMapper | undefined {
    const linesDiff = diff.diffArrays(oldLines, newLines);
    const mapping: MappingEntry[] = [];
    let currentOldIndex = 0;
    let currentNewIndex = 0;
    let noDeltaEnds = true;
    let commonStarts = false;
    let i = 0;
    let part: diff.ArrayChange<string> | undefined;
    // eslint-disable-next-line no-constant-condition
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
        mapping.push({
          oldLine: currentOldIndex,
          newLine: currentNewIndex,
        });
      }
      if (i > linesDiff.length) {
        break;
      }
      // start switching perspective
      if (part === undefined) {
        showInternalError(
          "bug in algorithm creating DiffLineMapper from mapping"
        );
        return;
      }
      if (!part.added) {
        currentOldIndex += part.value.length;
      }
      if (!part.removed) {
        currentNewIndex += part.value.length;
      }
      noDeltaEnds = commonStarts;
      // end switching perspective
    }
    return new DiffLineMapper(
      mapping,
      false,
      currentOldIndex,
      currentNewIndex
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
    if (line < minFromLine) {
      return minToLine;
    }
    if (line > maxFromLine) {
      return maxToLine;
    }
    const mappingMaxIndex = this.mapping.length - 1;
    let minIndex = 0;
    let maxIndex = mappingMaxIndex;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (minIndex + 1 >= maxIndex || minFromLine === maxFromLine) {
        break;
      }
      let nextIndex = Math.round(
        ((line - minFromLine) / (maxFromLine - minFromLine)) *
          (maxIndex - minIndex)
      );
      if (nextIndex <= minIndex) {
        nextIndex = minIndex + 1;
      } else if (nextIndex >= maxIndex) {
        nextIndex = maxIndex - 1;
      }
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
          minIndex >= 0 && this.getMappingFromLine(minIndex) >= line;
          minIndex--
        ) {} // eslint-disable-line no-empty
        minIndex++;
        for (
          maxIndex = nextIndex + 1;
          maxIndex <= mappingMaxIndex &&
          this.getMappingFromLine(maxIndex) <= line;
          maxIndex++
        ) {} // eslint-disable-line no-empty
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
    return Math.min(
      maxToLine,
      Math.max(
        minToLine,
        ((line - minFromLine) / (maxFromLine - minFromLine)) *
          (maxToLine - minToLine) +
          minToLine
      )
    );
  }

  public createReversed(): DiffLineMapper {
    return new DiffLineMapper(
      this.mapping,
      !this.reversed,
      this.oldCount,
      this.newCount
    );
  }

  private constructor(
    private readonly mapping: MappingEntry[],
    private readonly reversed: boolean,
    private readonly oldCount: number,
    private readonly newCount: number
  ) {}

  private getMappingFromLine(index: number): number {
    return this.reversed
      ? this.mapping[index].newLine
      : this.mapping[index].oldLine;
  }

  private getMappingToLine(index: number): number {
    return this.reversed
      ? this.mapping[index].oldLine
      : this.mapping[index].newLine;
  }
}

class IdentityLineMapper implements LineMapper {
  map(line: number): number {
    return line;
  }
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
const scrollSynchronizationMethod = `${extensionID}.scrollSynchronizationMethod`;
