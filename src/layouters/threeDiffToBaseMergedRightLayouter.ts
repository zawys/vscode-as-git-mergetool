import { Monitor } from "../monitor";
import { DiffLayouter, DiffLayouterFactory } from "./diffLayouter";
import { defaultTemporarySideBySideSettingsManagerLazy } from "../temporarySettingsManager";
import {
  SplitDiffLayouter,
  GroupOrientation,
  diffEditorSymbol,
} from "./splitDiffLayouter";
import { DiffedURIs } from "../diffedURIs";

export class ThreeDiffToBaseMergedRightLayouterFactory
  implements DiffLayouterFactory {
  public readonly settingValue = "3DiffToBaseMergedRight";

  public create(
    monitor: Monitor,
    temporarySideBySideSettingsManager = defaultTemporarySideBySideSettingsManagerLazy.value,
    diffedURIs: DiffedURIs
  ): DiffLayouter {
    return new SplitDiffLayouter(
      monitor,
      diffedURIs,
      (diffedURIs) => ({
        orientation: GroupOrientation.horizontal,
        groups: [
          {
            size: 0.5,
            groups: [
              {
                size: 0.5,
                type: diffEditorSymbol,
                oldUri: diffedURIs.base,
                newUri: diffedURIs.local,
                title: "(1) Current changes [readonly]",
                save: false,
              },
              {
                size: 0.5,
                type: diffEditorSymbol,
                oldUri: diffedURIs.base,
                newUri: diffedURIs.remote,
                title: "(2) Incoming changes [readonly]",
                save: false,
              },
            ],
          },
          {
            size: 0.5,
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.merged,
            title: "(3) Merged changes",
            save: true,
            isMergeEditor: true,
          },
        ],
      }),
      temporarySideBySideSettingsManager,
      undefined,
      1 / 3
    );
  }
}
