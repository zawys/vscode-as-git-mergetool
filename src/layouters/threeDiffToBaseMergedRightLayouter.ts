// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

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

export class ThreeDiffToBaseMergedRightLayouterFactory
  implements DiffLayouterFactory {
  public readonly settingValue = "3DiffToBaseMergedRight";

  public create(parameters: DiffLayouterFactoryParameters): DiffLayouter {
    return new SplitDiffLayouter({
      ...parameters,
      supportedZooms: [Zoom.top, Zoom.bottom, Zoom.left, Zoom.right],
      createLayoutDescription: (diffedURIs, zoom) => {
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
            leftSize = 0.58;
            break;
          case Zoom.bottom:
            topSize = 0.05;
            leftSize = 0.58;
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
                  title: "(1) Current changes",
                  notFocussable: zoom === Zoom.right || zoom === Zoom.bottom,
                  save: false,
                },
                {
                  size: bottomSize,
                  type: diffEditorSymbol,
                  oldUri: diffedURIs.base,
                  newUri: diffedURIs.remote,
                  title: "(2) Incoming changes",
                  notFocussable: zoom === Zoom.right || zoom === Zoom.top,
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
              notFocussable: zoom === Zoom.left,
              isMergeEditor: true,
            },
          ],
        };
      },
    });
  }
}
