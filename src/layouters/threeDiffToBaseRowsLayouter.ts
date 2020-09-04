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

export class ThreeDiffToBaseRowsLayouterFactory
  implements DiffLayouterFactory {
  public readonly settingValue = "3DiffToBaseRows";

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
        orientation: GroupOrientation.vertical,
        groups: [
          {
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.local,
            title: "(1) Current changes [readonly]",
            save: false,
            size: 0.275,
          },
          {
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.merged,
            title: "(2) Merged changes",
            save: true,
            size: 0.45,
            isMergeEditor: true,
          },
          {
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.remote,
            title: "(3) Incoming changes [readonly]",
            save: false,
            size: 0.275,
          },
        ],
      }),
      temporarySettingsManager,
      vSCodeConfigurator
    );
  }
}
