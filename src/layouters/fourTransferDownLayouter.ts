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

export class FourTransferDownLayouterFactory implements DiffLayouterFactory {
  public readonly settingValue = "4TransferDown";

  public create(
    monitor: Monitor,
    temporarySettingsManager: TemporarySettingsManager,
    diffedURIs: DiffedURIs,
    vSCodeConfigurator: VSCodeConfigurator
  ): DiffLayouter {
    const topSize = 0.45;
    const bottomSize = 1 - topSize;
    return new SplitDiffLayouter(
      monitor,
      diffedURIs,
      (diffedURIs) => ({
        orientation: GroupOrientation.horizontal,
        groups: [
          {
            groups: [
              {
                type: diffEditorSymbol,
                oldUri: diffedURIs.base,
                newUri: diffedURIs.local,
                title: "(1) Current changes on base [readonly]",
                save: false,
                size: topSize,
              },
              {
                type: diffEditorSymbol,
                oldUri: diffedURIs.remote,
                newUri: diffedURIs.merged,
                title: "(2) Current changes on incoming",
                save: true,
                size: bottomSize,
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
                size: topSize,
              },
              {
                type: diffEditorSymbol,
                oldUri: diffedURIs.local,
                newUri: diffedURIs.merged,
                title: "(4) Incoming changes on current",
                save: true,
                size: bottomSize,
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
