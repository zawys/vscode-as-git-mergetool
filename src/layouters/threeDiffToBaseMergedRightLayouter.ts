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

export class ThreeDiffToBaseMergedRightLayouterFactory
  implements DiffLayouterFactory {
  public readonly settingValue = "3DiffToBaseMergedRight";

  public create(
    monitor: Monitor,
    temporarySettingsManager: TemporarySettingsManager,
    diffedURIs: DiffedURIs,
    vSCodeConfigurator: VSCodeConfigurator
  ): DiffLayouter {
    return new SplitDiffLayouter(
      monitor,
      diffedURIs,
      (diffedURIs) => ({
        orientation: GroupOrientation.horizontal,
        groups: [
          {
            size: 0.5,
            groups: [
              {
                size: 0.5,
                type: diffEditorSymbol,
                oldUri: diffedURIs.base,
                newUri: diffedURIs.local,
                title: "(1) Current changes [readonly]",
                save: false,
              },
              {
                size: 0.5,
                type: diffEditorSymbol,
                oldUri: diffedURIs.base,
                newUri: diffedURIs.remote,
                title: "(2) Incoming changes [readonly]",
                save: false,
              },
            ],
          },
          {
            size: 0.5,
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.merged,
            title: "(3) Merged changes",
            save: true,
            isMergeEditor: true,
          },
        ],
      }),
      temporarySettingsManager,
      vSCodeConfigurator,
      1 / 3
    );
  }
}
