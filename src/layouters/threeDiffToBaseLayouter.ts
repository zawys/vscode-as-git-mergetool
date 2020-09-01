import { Monitor } from "../monitor";
import { DiffLayouter, DiffLayouterFactory } from "./diffLayouter";
import { defaultTemporarySideBySideSettingsManagerLazy } from "../temporarySettingsManager";
import {
  SplitDiffLayouter,
  GroupOrientation,
  diffEditorSymbol,
} from "./splitDiffLayouter";
import { DiffedURIs } from "../diffedURIs";

export class ThreeDiffToBaseLayouterFactory implements DiffLayouterFactory {
  public readonly settingValue = "3DiffToBase";

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
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.local,
            title: "(1) Current changes [readonly]",
            save: false,
            size: 0.3,
          },
          {
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.merged,
            title: "(2) Merged changes",
            save: true,
            size: 0.4,
            isMergeEditor: true,
          },
          {
            type: diffEditorSymbol,
            oldUri: diffedURIs.base,
            newUri: diffedURIs.remote,
            title: "(3) Incoming changes [readonly]",
            save: false,
            size: 0.3,
          },
        ],
      }),
      temporarySideBySideSettingsManager
    );
  }
}
