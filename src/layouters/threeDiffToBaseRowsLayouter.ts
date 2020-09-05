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
      (diffedURIs, zoom) => {
        let topSize = 0.275;
        let centerSize = 0.45;
        switch (zoom) {
          case Zoom.top:
            topSize = 0.55;
            centerSize = 0.4;
            break;
          case Zoom.bottom:
            topSize = 0.05;
            centerSize = 0.4;
            break;
          case Zoom.center:
            topSize = 0.05;
            centerSize = 0.9;
            break;
        }
        const bottomSize = 1 - topSize - centerSize;
        return {
          orientation: GroupOrientation.vertical,
          groups: [
            {
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.local,
              title: "(1) Current changes [readonly]",
              save: false,
              size: topSize,
            },
            {
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.merged,
              title: "(2) Merged changes",
              save: true,
              size: centerSize,
              isMergeEditor: true,
            },
            {
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.remote,
              title: "(3) Incoming changes [readonly]",
              save: false,
              size: bottomSize,
            },
          ],
        };
      },
      temporarySettingsManager,
      vSCodeConfigurator
    );
  }
}
