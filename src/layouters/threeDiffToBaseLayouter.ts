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
      (diffedURIs, zoom) => {
        let leftSize = 0.3;
        let centerSize = 0.4;
        switch (zoom) {
          case Zoom.left:
            leftSize = 0.55;
            centerSize = 0.4;
            break;
          case Zoom.right:
            leftSize = 0.05;
            centerSize = 0.4;
            break;
          case Zoom.center:
            leftSize = 0.05;
            centerSize = 0.9;
            break;
        }
        const rightSize = 1 - leftSize - centerSize;
        return {
          orientation: GroupOrientation.horizontal,
          groups: [
            {
              size: leftSize,
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.local,
              title: "(1) Current changes [readonly]",
              save: false,
              notFocussable: zoom === Zoom.right,
            },
            {
              size: centerSize,
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.merged,
              title: "(2) Merged changes",
              save: true,
              isMergeEditor: true,
            },
            {
              size: rightSize,
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.remote,
              title: "(3) Incoming changes [readonly]",
              save: false,
              notFocussable: zoom === Zoom.left,
            },
          ],
        };
      },
      temporarySettingsManager,
      vSCodeConfigurator
    );
  }
}
