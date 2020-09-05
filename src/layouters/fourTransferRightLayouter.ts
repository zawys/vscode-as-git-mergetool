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

export class FourTransferRightLayouterFactory implements DiffLayouterFactory {
  public readonly settingValue = "4TransferRight";

  public create(
    monitor: Monitor,
    temporarySettingsManager: TemporarySettingsManager,
    diffedURIs: DiffedURIs,
    vSCodeConfigurator: VSCodeConfigurator
  ): DiffLayouter {
    return new SplitDiffLayouter(
      monitor,
      diffedURIs,
      (diffedURIs, zoom: Zoom) => {
        let leftSize = 0.5;
        let topSize = 0.5;
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
          orientation: GroupOrientation.vertical,
          groups: [
            {
              size: topSize,
              groups: [
                {
                  size: leftSize,
                  type: diffEditorSymbol,
                  oldUri: diffedURIs.base,
                  newUri: diffedURIs.local,
                  title: "(1) Current changes on base [readonly]",
                  save: false,
                  notFocussable: zoom === Zoom.right || zoom === Zoom.bottom,
                },
                {
                  size: rightSize,
                  type: diffEditorSymbol,
                  oldUri: diffedURIs.remote,
                  newUri: diffedURIs.merged,
                  title: "(2) Current changes on incoming",
                  save: true,
                  notFocussable: zoom === Zoom.left || zoom === Zoom.bottom,
                  isMergeEditor: true,
                },
              ],
            },
            {
              size: bottomSize,
              groups: [
                {
                  size: leftSize,
                  type: diffEditorSymbol,
                  oldUri: diffedURIs.base,
                  newUri: diffedURIs.remote,
                  title: "(3) Incoming changes on base [readonly]",
                  save: false,
                  notFocussable: zoom === Zoom.right || zoom === Zoom.top,
                },
                {
                  size: rightSize,
                  type: diffEditorSymbol,
                  oldUri: diffedURIs.local,
                  newUri: diffedURIs.merged,
                  title: "(4) Incoming changes on current",
                  save: true,
                  notFocussable: zoom === Zoom.left || zoom === Zoom.top,
                  isMergeEditor: true,
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
