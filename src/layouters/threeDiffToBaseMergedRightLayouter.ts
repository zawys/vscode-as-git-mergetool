import { DiffedURIs } from "../diffedURIs";
import { Monitor } from "../monitor";
import { TemporarySettingsManager } from "../temporarySettingsManager";
import { VSCodeConfigurator } from "../vSCodeConfigurator";
import { Zoom } from "../zoom";
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
      (diffedURIs, zoom) => {
        let topSize = 0.5;
        let leftSize = 0.5;
        switch (zoom) {
          case Zoom.left:
            leftSize = 0.95;
            break;
          case Zoom.right:
            leftSize = 0.05;
            break;
          case Zoom.top:
            topSize = 0.95;
            break;
          case Zoom.bottom:
            topSize = 0.05;
            break;
        }
        const bottomSize = 1 - topSize;
        const rightSize = 1 - leftSize;
        return {
          orientation: GroupOrientation.horizontal,
          groups: [
            {
              size: leftSize,
              groups: [
                {
                  size: topSize,
                  type: diffEditorSymbol,
                  oldUri: diffedURIs.base,
                  newUri: diffedURIs.local,
                  title: "(1) Current changes [readonly]",
                  save: false,
                },
                {
                  size: bottomSize,
                  type: diffEditorSymbol,
                  oldUri: diffedURIs.base,
                  newUri: diffedURIs.remote,
                  title: "(2) Incoming changes [readonly]",
                  save: false,
                },
              ],
            },
            {
              size: rightSize,
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.merged,
              title: "(3) Merged changes",
              save: true,
              isMergeEditor: true,
            },
          ],
        };
      },
      temporarySettingsManager,
      vSCodeConfigurator,
      1 / 3
    );
  }
}
