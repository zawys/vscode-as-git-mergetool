import * as vscode from "vscode";
import { SingletonStore } from "./singletonStore";

export const defaultExtensionContextManager = new SingletonStore<
  vscode.ExtensionContext
>();
