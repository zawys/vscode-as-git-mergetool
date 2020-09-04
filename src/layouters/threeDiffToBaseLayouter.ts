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

export class ThreeDiffToBaseLayouterFactory implements DiffLayouterFactory {
  public readonly settingValue = "3DiffToBase";

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
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.local,
            title: "(1) Current changes [readonly]",
            save: false,
            size: 0.3,
          },
          {
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.merged,
            title: "(2) Merged changes",
            save: true,
            size: 0.4,
            isMergeEditor: true,
          },
          {
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.remote,
            title: "(3) Incoming changes [readonly]",
            save: false,
            size: 0.3,
          },
        ],
      }),
      temporarySettingsManager,
      vSCodeConfigurator
    );
  }
}
