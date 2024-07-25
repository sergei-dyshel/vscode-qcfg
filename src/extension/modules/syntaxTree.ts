import type * as vscode from "vscode";
import type {
  Event,
  ExtensionContext,
  TextDocument,
  TextDocumentChangeEvent,
  TextEditor,
} from "vscode";
import { EventEmitter, Position, Range, window, workspace } from "vscode";
import { assert, assertNotNull } from "../../library/exception";
import { Logger } from "../../library/logging";
import * as nodejs from "../../library/nodejs";
import { Timer } from "../../library/nodeUtils";
import type {
  SyntaxNode,
  SyntaxTree,
  SyntaxTreeEdit,
} from "../../library/treeSitter";
import { TreeSitter } from "../../library/treeSitter";
import { DefaultMap } from "../../library/tsUtils";
import { UserCommands } from "../../library/userCommands";
import { mapAsync } from "./async";
import { NumRange } from "./documentUtils";
import { handleErrors, handleStd, listenWrapped } from "./exception";
import { Modules } from "./module";
import { getActiveTextEditor } from "./utils";

const UPDATE_DELAY_MS = 1000;

declare module "web-tree-sitter" {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  interface SyntaxNode {
    readonly offsetRange: NumRange;
    readonly range: vscode.Range;
    readonly start: Position;
    readonly end: Position;
  }

  // eslint-disable-next-line @typescript-eslint/no-shadow
  interface Tree {
    version: number;
  }
}

export namespace SyntaxTrees {
  export function get(document: TextDocument): SyntaxTree {
    checkDocumentSupported(document);
    return trees.get(document).get();
  }
  export function isDocumentSupported(document: TextDocument) {
    return TreeSitter.languageSupported(document.languageId);
  }
}

export interface SyntaxTreeUpdatedEvent {
  document: TextDocument;
  tree: SyntaxTree;
}

const emmiter = new EventEmitter<SyntaxTreeUpdatedEvent>();
export const onSyntaxTreeUpdated: Event<SyntaxTreeUpdatedEvent> = emmiter.event;

//
// Private
//

function patchSyntaxNodePrototype(node: SyntaxNode) {
  const prototype = TreeSitter.syntaxNodePrototype(node);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ("offsetRange" in (prototype as any)) return;

  Object.defineProperty(prototype, "offsetRange", {
    get(): NumRange {
      const this_ = this as SyntaxNode;
      /* XXX: use memoization package? (e.g. memoizee) */
      if (!this.offsetRange_)
        this.offsetRange_ = new NumRange(this_.startIndex, this_.endIndex);
      return this.offsetRange_;
    },
  });

  Object.defineProperty(prototype, "range", {
    get(): Range {
      const this_ = this as SyntaxNode;
      if (!this.range_) this.range_ = new Range(this_.start, this_.end);
      return this.range_;
    },
  });

  Object.defineProperty(prototype, "start", {
    get(): Position {
      const this_ = this as SyntaxNode;
      if (!this.start_)
        this.start_ = new Position(
          this_.startPosition.row,
          this_.startPosition.column,
        );
      return this.start_;
    },
  });

  Object.defineProperty(prototype, "end", {
    get(): Position {
      const this_ = this as SyntaxNode;
      if (!this.end_)
        this.end_ = new Position(
          this_.endPosition.row,
          this_.endPosition.column,
        );
      return this.end_;
    },
  });
}
class DocumentContext {
  constructor(private readonly document: TextDocument) {
    this.log = new Logger({
      instance: nodejs.path.parse(document.fileName).name,
    });
    this.language = TreeSitter.language(document.languageId);
  }

  private tree?: SyntaxTree;
  private readonly timer: Timer = new Timer();
  private readonly log: Logger;
  private readonly language: TreeSitter.Language;

  get isUpToDate() {
    return this.tree && this.tree.version === this.document.version;
  }

  updateTree() {
    if (this.tree?.version === this.document.version) return;
    if (this.language.isLoading) {
      this.log.debug("Language is still loading");
      this.scheduleUpdate();
      return;
    }
    const incremental = this.tree !== undefined;
    const version = this.document.version;
    const start = Date.now();
    this.tree = this.language.parse(this.document.getText(), {
      prevTree: this.tree,
    });
    patchSyntaxNodePrototype(this.tree.rootNode);
    const end = Date.now();
    this.log.debug(
      `${incremental ? "Incremental" : "Full"} parsing took ${
        (end - start) / 1000
      } seconds (version ${version})`,
    );

    this.tree.version = version;
    emmiter.fire({ document: this.document, tree: this.tree });
  }

  applyChanges(changes: readonly vscode.TextDocumentContentChangeEvent[]) {
    assertNotNull(this.tree);
    for (const change of changes) {
      const newOffset = change.rangeOffset + change.text.length;
      const delta: SyntaxTreeEdit = {
        startIndex: change.rangeOffset,
        oldEndIndex: change.rangeOffset + change.rangeLength,
        newEndIndex: newOffset,
        startPosition: asPoint(change.range.start),
        oldEndPosition: asPoint(change.range.end),
        newEndPosition: asPoint(this.document.positionAt(newOffset)),
      };
      this.tree.edit(delta);
    }
  }

  onDocumentUpdated(
    changes: readonly vscode.TextDocumentContentChangeEvent[],
    scheduleUpdate = false,
  ) {
    if (!this.tree) return;
    if (changes.length === 0) return;
    this.applyChanges(changes);
    this.log.trace(
      `Edited tree with ${changes.length} changes, tree version ${this.tree.version}, document version ${this.document.version}`,
    );
    if (scheduleUpdate) this.scheduleUpdate();
  }

  scheduleUpdate() {
    this.timer.setTimeout(UPDATE_DELAY_MS, () => {
      handleStd(() => {
        this.updateTree();
      });
    });
  }

  get(): SyntaxTree {
    if (!this.isUpToDate) this.updateTree();
    return this.tree!;
  }

  verify() {
    assertNotNull(this.tree);
    const fullTree = this.language.parse(this.document.getText());
    assert(
      this.tree.rootNode.compare(fullTree.rootNode),
      "Parsed trees are not equal",
    );
  }
}

const trees = new DefaultMap<TextDocument, DocumentContext>(
  (document) => new DocumentContext(document),
);

function asPoint(pos: Position): TreeSitter.Point {
  return { row: pos.line, column: pos.character };
}

function checkDocumentSupported(document: TextDocument) {
  if (!SyntaxTrees.isDocumentSupported(document))
    throw new Error(
      `Syntax tree not available for language "${document.languageId}"`,
    );
}

function onDidChangeTextDocument(event: TextDocumentChangeEvent) {
  const document = event.document;
  const scheduleUpdate = window.activeTextEditor?.document === document;
  if (SyntaxTrees.isDocumentSupported(document))
    trees.get(document).onDocumentUpdated(event.contentChanges, scheduleUpdate);
}

function onDidChangeActiveTextEditor(editor: TextEditor | undefined) {
  if (!editor) return;
  const document = editor.document;
  if (SyntaxTrees.isDocumentSupported(document))
    trees.get(document).scheduleUpdate();
}

function onDidChangeVisibleTextEditors(editors: readonly TextEditor[]) {
  void mapAsync(
    editors,
    handleErrors(async (editor: TextEditor) => {
      const languageId = editor.document.languageId;
      if (!TreeSitter.languageSupported(languageId)) return;
      const language = TreeSitter.language(languageId);
      if (language.didLoad || language.isLoading) return;
      try {
        await language.load();
      } catch (err) {
        throw new Error(
          `Loading tree-sitter language "${languageId} failed: ${String(err)}`,
        );
      }
    }),
  );
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(workspace.onDidCloseTextDocument, (document) => {
      trees.delete(document);
    }),
    listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),
    listenWrapped(
      window.onDidChangeActiveTextEditor,
      onDidChangeActiveTextEditor,
    ),
    listenWrapped(
      window.onDidChangeVisibleTextEditors,
      onDidChangeVisibleTextEditors,
    ),
    listenWrapped(workspace.onDidCloseTextDocument, (doc) => {
      trees.delete(doc);
    }),
  );

  onDidChangeVisibleTextEditors(window.visibleTextEditors);
  onDidChangeActiveTextEditor(window.activeTextEditor);
}

UserCommands.register({
  command: "qcfg.syntaxTree.verify",
  title: "Verify syntax tree",
  callback: () => {
    trees.get(getActiveTextEditor().document).verify();
  },
});

Modules.register(activate);
