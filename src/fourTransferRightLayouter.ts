import * as vscode from 'vscode';
import { Monitor } from './monitor';
import { DiffLayouter, DiffLayouterFactory } from './diffLayouter';
import { defaultTemporarySideBySideSettingsManager } from './temporarySettingsManager';
import { SplitDiffLayouter, GroupOrientation, diffEditorSymbol } from './splitDiffLayouter';
import { DiffedURIs } from './diffedURIs';

export class FourTransferRightLayouterFactory implements DiffLayouterFactory {
  public readonly settingValue = "4TransferRight";

  public create(
    monitor: Monitor,
    temporarySideBySideSettingsManager = defaultTemporarySideBySideSettingsManager,
    diffedURIs: DiffedURIs,
  ): DiffLayouter {
    const leftSize = 0.5;
    const rightSize = 1 - leftSize;
    return new SplitDiffLayouter(monitor, diffedURIs, (diffedURIs) => ({
      orientation: GroupOrientation.vertical,
      groups: [
        {
          groups: [
            {
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.local,
              title: "Current (local) changes on base [readonly]",
              save: false,
              size: leftSize,
            },
            {
              type: diffEditorSymbol,
              oldUri: diffedURIs.remote,
              newUri: diffedURIs.merged,
              title: "Current (local) changes on incoming (remote)",
              save: true,
              size: rightSize,
              isMergeEditor: true,
            },
          ]
        },
        {
          groups: [
            {
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.remote,
              title: "Incoming (remote) changes on base [readonly]",
              save: false,
              size: leftSize,
            },
            {
              type: diffEditorSymbol,
              oldUri: diffedURIs.local,
              newUri: diffedURIs.merged,
              title: "Incoming (remote) changes on current (local)",
              save: true,
              size: rightSize,
            },
          ]
        },
      ]
    }),
      temporarySideBySideSettingsManager,
    );
  }
}
