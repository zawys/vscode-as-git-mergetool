// Copyright (C) 2020  zawys. Licensed under AGPL-3.0-or-later.
// See LICENSE file in repository root directory.

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
                  type: LayoutElementType.diffEditor,
                  oldUri: diffedURIs.base,
                  newUri: diffedURIs.local,
                  title: "(1) Current changes on base",
                  save: false,
                  notFocussable: zoom === Zoom.right || zoom === Zoom.bottom,
                },
                {
                  size: bottomSize,
                  type: LayoutElementType.diffEditor,
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
                  type: LayoutElementType.diffEditor,
                  oldUri: diffedURIs.base,
                  newUri: diffedURIs.remote,
                  title: "(3) Incoming changes on base",
                  save: false,
                  notFocussable: zoom === Zoom.left || zoom === Zoom.bottom,
                },
                {
                  size: bottomSize,
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
