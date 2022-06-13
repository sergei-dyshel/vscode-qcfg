'use strict';

import type { SyntaxNode } from 'tree-sitter';
import type {
  ExtensionContext,
  Range,
  TextDocument,
  TextEditorSelectionChangeEvent,
  TreeItemLabel,
} from 'vscode';
import { window } from 'vscode';
import { assert } from '../../library/exception';
import { stringify as str } from '../../library/stringify';
import { ellipsize } from '../../library/stringUtils';
import {
  listenAsyncWrapped,
  listenWrapped,
  registerAsyncCommandWrapped,
} from './exception';
import { Modules } from './module';
import type { SyntaxTreeUpdatedEvent } from './syntaxTree';
import { onSyntaxTreeUpdated, SyntaxTrees } from './syntaxTree';
import type { TreeNode, TreeProvider } from './treeView';
import { QcfgTreeView, StaticTreeNode } from './treeView';

const ELLIPSIZE_LEN = 20;

const treeProvider: TreeProvider = {
  async getTrees(): Promise<SyntaxTreeViewNode[] | undefined> {
    const editor = window.activeTextEditor;
    if (!editor || !SyntaxTrees.isDocumentSupported(editor.document)) {
      currentRoot = undefined;
      return [];
    }
    const document = editor.document;
    const tree = await SyntaxTrees.get(document);
    if (!currentRoot || currentRoot.syntaxNode !== tree.rootNode) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      if (rootCache.has(document)) currentRoot = rootCache.get(document)!;
      else {
        currentRoot = new SyntaxTreeViewNode(tree.rootNode, document);
        rootCache.set(document, currentRoot);
      }
    }
    return [currentRoot];
  },
  getMessage() {
    const editor = window.activeTextEditor;
    if (!editor) return 'No editor opened';
    const document = editor.document;
    if (!SyntaxTrees.isDocumentSupported(document))
      return `Language ${document.languageId} is not supported`;
    return '';
  },
  getTitle() {
    return 'syntax';
  },
  onDidChangeSelection(nodes_: readonly TreeNode[]) {
    const nodes = nodes_ as SyntaxTreeViewNode[];
    const editor = window.activeTextEditor;
    if (!editor) return;
    editor.selections = nodes.map((node) =>
      node.syntaxNode.range.asSelection(),
    );
    editor.revealRange(editor.selection);
  },
  onDidChangeVisibility(visible: boolean) {
    if (!visible || !currentRoot) return;
  },
};

let currentRoot: SyntaxTreeViewNode | undefined;
const rootCache = new Map<TextDocument, SyntaxTreeViewNode>();

function buildNodeLabel(
  node: SyntaxNode,
  document: TextDocument,
): TreeItemLabel | string {
  const name = buildNodeName(node, document);
  if (!name) return node.type;
  return { label: `${name} (${node.type})`, highlights: [[0, name.length]] };
}

function buildNodeName(
  node: SyntaxNode,
  document: TextDocument,
): string | undefined {
  const lang = document.languageId;
  if (lang === 'python') {
    if (
      node.nodeType === 'decorated_definition' &&
      node.lastNamedChild &&
      node.lastNamedChild.nodeType === 'function_definition'
    )
      return buildNodeName(node.lastNamedChild, document);
    if (
      (node.nodeType === 'function_definition' ||
        node.nodeType === 'class_definition') &&
      node.firstNamedChild &&
      node.firstNamedChild.nodeType === 'identifier'
    ) {
      return node.firstNamedChild.text;
    }
  }
  if (lang === 'c' || lang === 'cpp') {
    switch (node.nodeType) {
      case 'system_lib_string':
        return node.text;
      case 'preproc_include':
        if (node.firstNamedChild)
          return buildNodeName(node.firstNamedChild, document);
        break;
      case 'function_definition':
      case 'declaration':
        if (
          node.firstNamedChild &&
          node.firstNamedChild.nodeType === 'function_declarator'
        )
          return buildNodeName(node.firstNamedChild, document);
        if (
          node.namedChildCount >= 2 &&
          node.namedChild(1)!.nodeType === 'function_declarator'
        )
          return buildNodeName(node.namedChild(1)!, document);
        if (
          node.namedChildCount >= 3 &&
          node.namedChild(2)!.nodeType === 'function_declarator'
        )
          return buildNodeName(node.namedChild(2)!, document);
        break;
      case 'function_declarator':
        if (
          node.firstNamedChild &&
          (node.firstNamedChild.nodeType === 'scoped_identifier' ||
            node.firstNamedChild.nodeType === 'identifier')
        )
          return buildNodeName(node.firstNamedChild, document);
        break;
      default:
        return undefined;
    }
  }
  switch (node.nodeType) {
    case 'string_literal':
      return ellipsize(node.text, ELLIPSIZE_LEN);
    case 'identifier':
    case 'namespace_identifier':
    case 'number_literal':
    case 'type_qualifier':
    case 'type_identifier':
    case 'primitive_type':
    case 'type_descriptor':
    case 'storage_class_specifier':
      return node.text;
    case 'scoped_identifier':
    case 'template_type':
    case 'scoped_type_identifier':
      return ellipsize(node.text, ELLIPSIZE_LEN);
    default:
      return undefined;
  }
}

class SyntaxTreeViewNode extends StaticTreeNode {
  constructor(
    public syntaxNode: SyntaxNode,
    private readonly document: TextDocument,
  ) {
    super(buildNodeLabel(syntaxNode, document));
    assert(syntaxNode.isNamed);
    if (syntaxNode.namedChildCount > 0) this.setCollapsed();
    this.treeItem.id = this.calcId();
  }

  private calcId(): string {
    const editor = window.activeTextEditor;
    if (!editor) return '';
    const document = editor.document;
    const range = this.syntaxNode.range;
    const obj = {
      document: str(document),
      type: this.syntaxNode.type,
      range: str(range),
    };
    return str(obj);
  }

  override get children(): SyntaxTreeViewNode[] {
    if (this.syntaxNode.namedChildCount > 0 && super.children.length === 0) {
      for (let i = 0; i < this.syntaxNode.namedChildCount; ++i)
        this.addChild(
          new SyntaxTreeViewNode(this.syntaxNode.namedChild(i)!, this.document),
        );
    }
    return super.children as SyntaxTreeViewNode[];
  }
}

async function showTree() {
  QcfgTreeView.setProvider(treeProvider);
  await treeProvider.getTrees();
  if (!currentRoot) return;
  const node = findContainingNode(
    currentRoot,
    window.activeTextEditor!.selection,
  );
  if (node) await selectAndRememberNode(node, true /* focus */);
}

function onTreeUpdated(event: SyntaxTreeUpdatedEvent) {
  rootCache.delete(event.document);
  if (QcfgTreeView.isCurrentProvider(treeProvider)) QcfgTreeView.refresh();
}

function onTextEditorChanged() {
  if (!QcfgTreeView.isCurrentProvider(treeProvider)) return;
  QcfgTreeView.refresh();
}

async function selectAndRememberNode(node: SyntaxTreeViewNode, focus = false) {
  await QcfgTreeView.revealTree(node, { focus, select: true });
}

async function onSelectionChanged(event: TextEditorSelectionChangeEvent) {
  if (
    !QcfgTreeView.isCurrentProvider(treeProvider) ||
    !SyntaxTrees.isDocumentSupported(event.textEditor.document) ||
    !QcfgTreeView.isVisible()
  )
    return;
  const roots = await treeProvider.getTrees();
  if (!roots || roots.isEmpty) return;
  const root = roots[0] as SyntaxTreeViewNode;
  const node = findContainingNode(root, event.textEditor.selection);
  if (node) await selectAndRememberNode(node);
}

function findContainingNode(
  node: SyntaxTreeViewNode,
  selection: Range,
): SyntaxTreeViewNode | undefined {
  if (!node.syntaxNode.range.contains(selection)) return;
  for (const child of node.children) {
    const descendant = findContainingNode(child, selection);
    if (descendant) return descendant;
  }
  return node;
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.syntaxTree.show', showTree),
    listenWrapped(window.onDidChangeActiveTextEditor, onTextEditorChanged),
    listenAsyncWrapped(
      window.onDidChangeTextEditorSelection,
      onSelectionChanged,
    ),
    listenWrapped(onSyntaxTreeUpdated, onTreeUpdated),
  );
}

Modules.register(activate);
