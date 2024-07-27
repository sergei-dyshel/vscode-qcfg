import { window } from "vscode";

export namespace MessageDialog {
  export enum Severity {
    INFORMATION,
    WARNING,
    ERROR,
  }

  export const INFORMATION = Severity.INFORMATION;
  export const WARNING = Severity.WARNING;
  export const ERROR = Severity.ERROR;

  /**
   * Either title or tuple of [title, detail] (_detail_ is rendered less
   * prominent)
   */
  type Message = string | [message: string, detail: string];

  /**
   * Show modal message of given severity, let user pick an option.
   *
   * Should be used as more type-safe version of `window.show...Message` family
   * of functions (e.g. {@link window.showInformationMessage})
   *
   * @param severity {@link Severity}
   * @param message {@link Message}
   * @param items Array of actions. For type-safety use `[a, b] as const`
   *   notation.
   * @param onCancel Triggered when user cancels the dialog (presses ESC)
   */
  export function showModal<T extends readonly string[]>(
    severity: Severity,
    message: Message,
    items: T,
    onCancel: (typeof items)[number],
  ): Promise<(typeof items)[number]>;

  export function showModal<T extends readonly string[]>(
    severity: Severity,
    message: Message,
    items: T,
  ): Promise<(typeof items)[number] | undefined>;

  export function showModal(
    severity: Severity,
    message: Message,
  ): Promise<void>;

  export async function showModal(
    severity: Severity,
    message: Message,
    items?: string[],
    onCancel?: string,
    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  ): Promise<string | undefined | void> {
    if (!items) items = [];
    const messageItems = items.map((title) => ({
      title,
      isCloseAffordance: title === onCancel,
    }));

    const msg = typeof message === "string" ? message : message[0];
    const detail = typeof message === "string" ? undefined : message[1];

    const result = await severityToFunc(severity)(
      msg,
      { detail, modal: true },
      ...messageItems,
    );
    return result?.title;
  }

  function severityToFunc(severity: Severity) {
    switch (severity) {
      case INFORMATION:
        return window.showInformationMessage;
      case WARNING:
        return window.showWarningMessage;
      case ERROR:
        return window.showErrorMessage;
    }
  }
}
