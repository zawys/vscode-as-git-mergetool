import { commands, Disposable, Event, EventEmitter } from "vscode";
import { extensionID } from "./iDs";

export enum Zoom {
  default,
  center,
  left,
  right,
  top,
  bottom,
}
export const zoomCommandIDs = new Map<Zoom, string>();
for (const [zoom, commandPart] of [
  [Zoom.default, "Default"],
  [Zoom.center, "Center"],
  [Zoom.left, "Left"],
  [Zoom.right, "Right"],
  [Zoom.top, "Top"],
  [Zoom.bottom, "Bottom"],
] as [Zoom, string][]) {
  zoomCommandIDs.set(zoom, `${extensionID}.zoom${commandPart}`);
}

export class ZoomListener implements Disposable {
  public register(): void {
    for (const [zoom, commandID] of zoomCommandIDs.entries()) {
      commands.registerCommand(commandID, () => {
        this.wasZoomRequested.fire(zoom);
      });
    }
  }

  public dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.wasZoomRequested.dispose();
  }

  public get onWasZoomRequested(): Event<Zoom> {
    return this.wasZoomRequested.event;
  }

  private disposables: Disposable[] = [];
  private wasZoomRequested = new EventEmitter<Zoom>();
}
