import { Monitor } from "../monitor";
import { DiffLayouter, DiffLayouterFactory } from "./diffLayouter";
import { defaultTemporarySideBySideSettingsManagerLazy } from "../temporarySettingsManager";
import {
  SplitDiffLayouter,
  GroupOrientation,
  diffEditorSymbol,
} from "./splitDiffLayouter";
import { DiffedURIs } from "../diffedURIs";

export class ThreeDiffToBaseRowsLayouterFactory
  implements DiffLayouterFactory {
  public readonly settingValue = "3DiffToBaseRows";

  public create(
    monitor: Monitor,
    temporarySideBySideSettingsManager = defaultTemporarySideBySideSettingsManagerLazy.value,
    diffedURIs: DiffedURIs
  ): DiffLayouter {
    return new SplitDiffLayouter(
      monitor,
      diffedURIs,
      (diffedURIs) => ({
        orientation: GroupOrientation.vertical,
        groups: [
          {
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.local,
            title: "(1) Current changes [readonly]",
            save: false,
            size: 0.275,
          },
          {
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.merged,
            title: "(2) Merged changes",
            save: true,
            size: 0.45,
            isMergeEditor: true,
          },
          {
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.remote,
            title: "(3) Incoming changes [readonly]",
            save: false,
            size: 0.275,
          },
        ],
      }),
      temporarySideBySideSettingsManager
    );
  }
}
