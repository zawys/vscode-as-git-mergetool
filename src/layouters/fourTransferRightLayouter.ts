import { Zoom } from "../zoom";
import {
  DiffLayouter,
  DiffLayouterFactory,
  DiffLayouterFactoryParameters,
} from "./diffLayouter";
import {
  GroupOrientation,
  LayoutElementType,
  SplitDiffLayouter,
} from "./splitDiffLayouter";

export class FourTransferRightLayouterFactory implements DiffLayouterFactory {
  public readonly settingValue = "4TransferRight";

  public create(parameters: DiffLayouterFactoryParameters): DiffLayouter {
    return new SplitDiffLayouter({
      ...parameters,
      supportedZooms: [Zoom.top, Zoom.bottom, Zoom.left, Zoom.right],
      createLayoutDescription: (diffedURIs, zoom: Zoom) => {
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
                  type: LayoutElementType.diffEditor,
                  oldUri: diffedURIs.base,
                  newUri: diffedURIs.local,
                  title: "(1) Current changes on base",
                  save: false,
                  notFocussable: zoom === Zoom.right || zoom === Zoom.bottom,
                },
                {
                  size: rightSize,
                  type: LayoutElementType.diffEditor,
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
                  type: LayoutElementType.diffEditor,
                  oldUri: diffedURIs.base,
                  newUri: diffedURIs.remote,
                  title: "(3) Incoming changes on base",
                  save: false,
                  notFocussable: zoom === Zoom.right || zoom === Zoom.top,
                },
                {
                  size: rightSize,
                  type: LayoutElementType.diffEditor,
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
