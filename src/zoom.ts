import {
  commands,
  Disposable,
  Event,
  EventEmitter,
  StatusBarAlignment,
  window,
} from "vscode";
import { extensionID, firstLetterUppercase } from "./iDs";

export const enum Zoom {
  default,
  center,
  left,
  right,
  top,
  bottom,
}
export interface ZoomInfo {
  commandID: string;
  name: string;
  symbol: string;
}
export const allZooms = new Map<Zoom, ZoomInfo>();

for (const [zoom, name, symbol] of [
  [Zoom.default, "default", "$(discard)"],
  [Zoom.center, "center", "▣"],
  [Zoom.left, "left", "◧"],
  [Zoom.right, "right", "◨"],
  [Zoom.top, "top", "⬒"],
  [Zoom.bottom, "bottom", "⬓"],
] as [Zoom, string, string][]) {
  allZooms.set(zoom, {
    commandID: `${extensionID}.zoom${firstLetterUppercase(name)}`,
    name,
    symbol,
  });
}

export class ZoomManager implements Disposable {
  public register(): void {
    for (const [zoom, { commandID }] of allZooms.entries()) {
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
    this.removeStatusBarItems();
  }

  public get onWasZoomRequested(): Event<Zoom> {
    return this.wasZoomRequested.event;
  }

  public createStatusBarItems(
    supportedZooms: Zoom[],
    startPriority = 0
  ): void {
    this.removeStatusBarItems();
    this.priority = startPriority;
    this.addStatusBarItem({ text: "Zoom:" });
    for (const zoom of [Zoom.default, ...supportedZooms]) {
      const zoomInfo = allZooms.get(zoom);
      if (zoomInfo === undefined) {
        continue;
      }
      this.addZoomStatusBarItem(zoomInfo);
    }
  }

  public removeStatusBarItems(): void {
    for (const disposable of this.statusbarItems) {
      disposable.dispose();
    }
    this.statusbarItems = [];
  }

  private disposables: Disposable[] = [];
  private wasZoomRequested = new EventEmitter<Zoom>();
  private statusbarItems: Disposable[] = [];
  private priority = 0;

  private addZoomStatusBarItem({ name, symbol, commandID }: ZoomInfo): void {
    this.addStatusBarItem({ text: symbol, tooltip: name, commandID });
  }

  private addStatusBarItem({
    text,
    tooltip,
    commandID,
  }: {
    text: string;
    tooltip?: string;
    commandID?: string;
  }) {
    const item = window.createStatusBarItem(
      StatusBarAlignment.Left,
      this.priority--
    );
    item.text = text;
    item.tooltip = tooltip;
    item.command = commandID;
    this.statusbarItems.push(item);
    item.show();
  }
}
