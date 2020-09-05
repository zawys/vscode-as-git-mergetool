import { Zoom } from "../zoom";
import {
  DiffLayouter,
  DiffLayouterFactory,
  DiffLayouterFactoryParameters,
} from "./diffLayouter";
import {
  diffEditorSymbol,
  GroupOrientation,
  SplitDiffLayouter,
} from "./splitDiffLayouter";

export class FourTransferDownLayouterFactory implements DiffLayouterFactory {
  public readonly settingValue = "4TransferDown";

  public create(parameters: DiffLayouterFactoryParameters): DiffLayouter {
    return new SplitDiffLayouter({
      ...parameters,
      supportedZooms: [Zoom.left, Zoom.right, Zoom.top, Zoom.bottom],
      createLayoutDescription: (diffedURIs, zoom) => {
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
                  size: topSize,
                  type: diffEditorSymbol,
                  oldUri: diffedURIs.base,
                  newUri: diffedURIs.local,
                  title: "(1) Current changes on base [readonly]",
                  save: false,
                  notFocussable: zoom === Zoom.right || zoom === Zoom.bottom,
                },
                {
                  size: bottomSize,
                  type: diffEditorSymbol,
                  oldUri: diffedURIs.remote,
                  newUri: diffedURIs.merged,
                  title: "(2) Current changes on incoming",
                  save: true,
                  notFocussable: zoom === Zoom.right || zoom === Zoom.top,
                  isMergeEditor: true,
                },
              ],
            },
            {
              size: rightSize,
              groups: [
                {
                  size: topSize,
                  type: diffEditorSymbol,
                  oldUri: diffedURIs.base,
                  newUri: diffedURIs.remote,
                  title: "(3) Incoming changes on base [readonly]",
                  save: false,
                  notFocussable: zoom === Zoom.left || zoom === Zoom.bottom,
                },
                {
                  size: bottomSize,
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
    });
  }
}
