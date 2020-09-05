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

export class FourTransferDownLayouterFactory implements DiffLayouterFactory {
  public readonly settingValue = "4TransferDown";

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
        let leftSize = 0.5;
        let topSize = 0.45;
        switch (zoom) {
          case Zoom.top:
            topSize = 0.95;
            break;
          case Zoom.bottom:
            topSize = 0.05;
            break;
          case Zoom.left:
            leftSize = 0.95;
            break;
          case Zoom.right:
            leftSize = 0.05;
            break;
        }
        const rightSize = 1 - leftSize;
        const bottomSize = 1 - topSize;
        return {
          orientation: GroupOrientation.horizontal,
          groups: [
            {
              size: leftSize,
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
              size: rightSize,
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
        };
      },
      temporarySettingsManager,
      vSCodeConfigurator
    );
  }
}
