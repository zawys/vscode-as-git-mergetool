import { ExtensionContext } from "vscode";
import { SingletonStore } from "./singletonStore";

export const defaultExtensionContextManager = new SingletonStore<ExtensionContext>();
