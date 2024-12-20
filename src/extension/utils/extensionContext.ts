import { ExtensionMode, type ExtensionContext } from "vscode";

let extContext: ExtensionContext;

export function extensionContext(): ExtensionContext {
  return extContext;
}

export function setExtensionContext(context: ExtensionContext) {
  extContext = context;
}

export function extensionDebug(): boolean {
  return extensionContext().extensionMode === ExtensionMode.Development;
}
