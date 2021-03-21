'use strict';

import type { StatusBarItem, TextEditor, ViewColumn } from 'vscode';
import { ThemeColor, window } from 'vscode';

import { Timer } from '../../library/nodeUtils';

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
  if (options?.errorBackground)
    statusBarMsgItem.backgroundColor = new ThemeColor(
      'statusBarItem.errorBackground',
    );

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
 * Private
 */

let statusBarMsgItem: StatusBarItem | undefined;
const timer = new Timer();
