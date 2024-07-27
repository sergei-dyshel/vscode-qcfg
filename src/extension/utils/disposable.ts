import { extensions, workspace } from "vscode";
import type { DisposableLike } from "../../library/disposable";
import { Logger } from "../../library/logging";
import { listenWrapped } from "../modules/exception";
import type { ConfigSection } from "./configuration";

/**
 * Automatically create/dispose resorcuce when on configuration/ changes,
 * extensions loading/unloading etc.
 */
export class ConditionalResource implements DisposableLike {
  private readonly extListener?: DisposableLike;
  private readonly configListener?: DisposableLike;
  private resource?: DisposableLike;
  private readonly log: Logger;

  constructor(
    name: string,
    private readonly createFunc: () => DisposableLike,
    private readonly options: {
      extensionId?: string;
      configSection?: ConfigSection;
    },
  ) {
    this.log = new Logger({ instance: name });
    if (options.extensionId)
      this.extListener = listenWrapped(extensions.onDidChange, () => {
        this.checkResource();
      });
    if (options.configSection)
      this.configListener = listenWrapped(
        workspace.onDidChangeConfiguration,
        (change) => {
          if (change.affectsConfiguration(this.options.configSection!))
            this.checkResource();
        },
      );
    this.checkResource();
  }

  dispose() {
    this.extListener?.dispose();
    this.configListener?.dispose();
    this.resource?.dispose();
  }

  private checkResource() {
    if (
      this.options.extensionId &&
      extensions.all.firstOf((ext) => ext.id === this.options.extensionId) ===
        undefined
    ) {
      this.disposeResource();
      return;
    }
    if (
      this.options.configSection &&
      !workspace.getConfiguration().get<boolean>(this.options.configSection)
    ) {
      this.disposeResource();
      return;
    }

    if (this.resource) return;
    this.resource = this.createFunc();
    this.log.debug("created");
  }

  private disposeResource() {
    if (this.resource) {
      this.resource.dispose();
      this.log.debug("disposed");
    }
  }
}
