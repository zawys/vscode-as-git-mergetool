import * as vscode from 'vscode';
import { Monitor } from '../monitor';
import { DiffLayouter, DiffLayouterFactory } from './diffLayouter';
import { defaultTemporarySideBySideSettingsManagerLazy } from '../temporarySettingsManager';
import { SplitDiffLayouter, GroupOrientation, diffEditorSymbol } from './splitDiffLayouter';
import { DiffedURIs } from '../diffedURIs';

export class FourTransferDownLayouterFactory implements DiffLayouterFactory {
  public readonly settingValue = "4TransferDown";

  public create(
    monitor: Monitor,
    temporarySideBySideSettingsManager =
      defaultTemporarySideBySideSettingsManagerLazy.value,
    diffedURIs: DiffedURIs,
  ): DiffLayouter {
    const topSize = 0.45;
    const bottomSize = 1 - topSize;
    return new SplitDiffLayouter(monitor, diffedURIs, (diffedURIs) => ({
      orientation: GroupOrientation.horizontal,
      groups: [
        {
          groups: [
            {
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.local,
              title: "Current (local) changes on base [readonly]",
              save: false,
              size: topSize,
            },
            {
              type: diffEditorSymbol,
              oldUri: diffedURIs.remote,
              newUri: diffedURIs.merged,
              title: "Current (local) changes on incoming (remote)",
              save: true,
              size: bottomSize,
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
              size: topSize,
            },
            {
              type: diffEditorSymbol,
              oldUri: diffedURIs.local,
              newUri: diffedURIs.merged,
              title: "Incoming (remote) changes on current (local)",
              save: true,
              size: bottomSize,
            },
          ]
        },
      ]
    }), temporarySideBySideSettingsManager);
  }
}
