import { DiffedURIs } from "../diffedURIs";
import { Monitor } from "../monitor";
import { TemporarySettingsManager } from "../temporarySettingsManager";
import { VSCodeConfigurator } from "../vSCodeConfigurator";
import { DiffLayouter, DiffLayouterFactory } from "./diffLayouter";
import {
  diffEditorSymbol,
  GroupOrientation,
  SplitDiffLayouter,
} from "./splitDiffLayouter";

export class FourTransferRightLayouterFactory implements DiffLayouterFactory {
  public readonly settingValue = "4TransferRight";

  public create(
    monitor: Monitor,
    temporarySettingsManager: TemporarySettingsManager,
    diffedURIs: DiffedURIs,
    vSCodeConfigurator: VSCodeConfigurator
  ): DiffLayouter {
    const leftSize = 0.5;
    const rightSize = 1 - leftSize;
    return new SplitDiffLayouter(
      monitor,
      diffedURIs,
      (diffedURIs) => ({
        orientation: GroupOrientation.vertical,
        groups: [
          {
            groups: [
              {
                type: diffEditorSymbol,
                oldUri: diffedURIs.base,
                newUri: diffedURIs.local,
                title: "(1) Current changes on base [readonly]",
                save: false,
                size: leftSize,
              },
              {
                type: diffEditorSymbol,
                oldUri: diffedURIs.remote,
                newUri: diffedURIs.merged,
                title: "(2) Current changes on incoming",
                save: true,
                size: rightSize,
                isMergeEditor: true,
              },
            ],
          },
          {
            groups: [
              {
                type: diffEditorSymbol,
                oldUri: diffedURIs.base,
                newUri: diffedURIs.remote,
                title: "(3) Incoming changes on base [readonly]",
                save: false,
                size: leftSize,
              },
              {
                type: diffEditorSymbol,
                oldUri: diffedURIs.local,
                newUri: diffedURIs.merged,
                title: "(4) Incoming changes on current",
                save: true,
                size: rightSize,
              },
            ],
          },
        ],
      }),
      temporarySettingsManager,
      vSCodeConfigurator
    );
  }
}
