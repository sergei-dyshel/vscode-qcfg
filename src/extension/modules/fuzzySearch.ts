// Borrowed from https://github.com/jacobdufault/vscode-fuzzy-search by Jacob Dufault

import { getActiveTextEditor } from "@sergei-dyshel/vscode";
import * as vscode from "vscode";
import { handleErrors, registerSyncCommandWrapped } from "./exception";
import { Modules } from "./module";

class Item implements vscode.QuickPickItem {
  constructor(
    public label: string,
    public line: number,
  ) {
    this.label = label.trim();
  }
}

let valueFromPreviousInvocation = "";
let lastSelected: Item | undefined;

function showFuzzySearch() {
  // Build the entries we will show the user. One entry for each non-empty line,
  // prefixed with the line number. We prefix with the line number so lines stay
  // in the correct order and so duplicate lines do not get merged together.
  const editor = getActiveTextEditor();
  const lines: string[] = editor.document.getText().split(/\r?\n/);
  const quickPickEntries: Item[] = [];
  for (const [i, line_] of lines.entries()) {
    if (!line_) {
      continue;
    }
    const line = `${(i + 1).toString()}: ${line_.trim()}`;
    if (line.length <= 60) {
      quickPickEntries.push(new Item(line, i + 1));
      continue;
    }
    quickPickEntries.push(
      new Item(line.slice(0, 58) + "…", i + 1),
      new Item(
        `${(i + 1).toString()}: …${line_
          .trim()
          .slice(Math.max(0, line.length - 60 + 1))}`,
        i + 1,
      ),
    );
  }

  // Setup basic quick pick.
  const pick = vscode.window.createQuickPick<Item>();
  pick.sortByLabel = false;
  pick.items = quickPickEntries;
  pick.canSelectMany = false;

  // Try to preselect the previously selected item.
  if (lastSelected) {
    // Update `lastSelected` reference to point to the current entry in `items`.
    lastSelected = quickPickEntries.find(
      (t) => t.line === lastSelected!.line || t.label === lastSelected!.label,
    );
    pick.activeItems = [lastSelected!];
  }
  // Save the item the user selected so it can be pre-selected next time fuzzy
  // search is invoked.
  pick.onDidAccept(
    handleErrors(() => {
      lastSelected = pick.selectedItems[0];
      pick.hide();
    }),
  );

  // Show the currently selected item in the editor.
  pick.onDidChangeActive(
    handleErrors((items) => {
      if (items.length === 0) return;

      const p = new vscode.Position(items[0].line - 1, 0);
      editor.revealRange(
        new vscode.Range(p, p),
        vscode.TextEditorRevealType.InCenter,
      );
      editor.selection = new vscode.Selection(p, p);
    }),
  );

  // Show the previous search string. When the user types a character, the
  // preview string will replaced with the typed character.
  pick.value = valueFromPreviousInvocation;
  const previewValue = valueFromPreviousInvocation;
  let hasPreviewValue = previewValue.length > 0;
  pick.onDidChangeValue(
    handleErrors((value: string) => {
      if (!hasPreviewValue) {
        return;
      }
      hasPreviewValue = false;

      // Try to figure out what text the user typed. Assumes that the user
      // typed at most one character.
      for (let i = 0; i < value.length; ++i) {
        if (previewValue.charAt(i) !== value.charAt(i)) {
          pick.value = value.charAt(i);
          break;
        }
      }
    }),
  );
  // Save the search string so we can show it next time fuzzy search is
  // invoked.
  pick.onDidChangeValue((value) => {
    valueFromPreviousInvocation = value;
  });

  // If fuzzy-search was cancelled navigate to the previous location.
  const startingSelection = editor.selection;
  pick.onDidHide(
    handleErrors(() => {
      if (pick.selectedItems.length === 0) {
        editor.revealRange(
          new vscode.Range(startingSelection.start, startingSelection.end),
          vscode.TextEditorRevealType.InCenter,
        );
        editor.selection = startingSelection;
      }
    }),
  );
  pick.show();
}

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    registerSyncCommandWrapped("qcfg.fuzzySearch", () => {
      showFuzzySearch();
    }),
  );
}

Modules.register(activate);
