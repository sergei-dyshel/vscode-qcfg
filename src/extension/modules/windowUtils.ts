'use strict';

import type { StatusBarItem, TextEditor, ThemeColor, ViewColumn } from 'vscode';
import { window } from 'vscode';
import { Timer } from '../../library/nodeUtils';
import { setStatusBarErrorBackground } from '../utils/statusBar';
import { handleAsyncStd } from './exception';

const DEFAULT_TIMEOUT_MS = 3000;

export function showStatusBarMessage(
  text: string,
  options?: {
    color?: ThemeColor | string;
    timeoutMs?: number;
    errorBackground?: boolean;
  },
) {
  if (statusBarMsgItem) statusBarMsgItem.dispose();
  statusBarMsgItem = window.createStatusBarItem();
  statusBarMsgItem.text = text;
  statusBarMsgItem.color = options?.color;
  if (options?.errorBackground) setStatusBarErrorBackground(statusBarMsgItem);

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  timer.setTimeout(timeoutMs, clearStatusBarMessage);
  statusBarMsgItem.show();
}

export function clearStatusBarMessage() {
  if (statusBarMsgItem) statusBarMsgItem.dispose();
}

export function getVisibleEditor(
  viewColumn: ViewColumn,
): TextEditor | undefined {
  return window.visibleTextEditors.firstOf(
    (editor) => editor.viewColumn === viewColumn,
  );
}

/**
 * Save and restore editor and selection
 *
 * Useful when running interactive commands that may "preview" other locations
 */
export async function preserveActiveLocation<T>(
  promise: Promise<T>,
  options?: {
    skipOnSuccess?: boolean;
    skipOnNull?: boolean;
  },
): Promise<T> {
  const prevEditor = window.activeTextEditor;
  const prevSelection = prevEditor?.selection;
  const restore = () => {
    if (!prevEditor) {
      return;
    }
    const newEditor = window.activeTextEditor;
    if (
      newEditor &&
      (newEditor !== prevEditor || !prevSelection!.isEqual(newEditor.selection))
    ) {
      handleAsyncStd(
        window.showTextDocument(prevEditor.document, {
          selection: prevSelection,
        }),
      );
    }
  };

  return new Promise<T>((resolve, reject) => {
    promise.then(
      (result) => {
        if (!options?.skipOnSuccess) {
          /* TODO:  */
          restore();
        }
        resolve(result);
      },
      (reason) => {
        restore();
        reject(reason);
      },
    );
  });
}

/**
 * Private
 */

let statusBarMsgItem: StatusBarItem | undefined;
const timer = new Timer();
