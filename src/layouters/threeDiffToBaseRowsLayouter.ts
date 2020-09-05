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

export class ThreeDiffToBaseRowsLayouterFactory
  implements DiffLayouterFactory {
  public readonly settingValue = "3DiffToBaseRows";

  public create(parameters: DiffLayouterFactoryParameters): DiffLayouter {
    return new SplitDiffLayouter({
      ...parameters,
      supportedZooms: [Zoom.top, Zoom.center, Zoom.bottom],
      createLayoutDescription: (diffedURIs, zoom) => {
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
              size: topSize,
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.local,
              title: "(1) Current changes",
              save: false,
              notFocussable: zoom === Zoom.bottom || zoom === Zoom.center,
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
              size: bottomSize,
              type: diffEditorSymbol,
              oldUri: diffedURIs.base,
              newUri: diffedURIs.remote,
              title: "(3) Incoming changes",
              save: false,
              notFocussable: zoom === Zoom.top || zoom === Zoom.center,
            },
          ],
        };
      },
    });
  }
}
