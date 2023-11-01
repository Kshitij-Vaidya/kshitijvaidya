"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StructureView = exports.TeXElementType = void 0;
const vscode = __importStar(require("vscode"));
const lw = __importStar(require("../lw"));
const eventbus_1 = require("../components/eventbus");
const latex_1 = require("./structurelib/latex");
const bibtex_1 = require("./structurelib/bibtex");
const doctex_1 = require("./structurelib/doctex");
const logger_1 = require("../components/logger");
const parser_1 = require("../components/parser");
const logger = (0, logger_1.getLogger)('Structure');
var TeXElementType;
(function (TeXElementType) {
    TeXElementType[TeXElementType["Environment"] = 0] = "Environment";
    TeXElementType[TeXElementType["Command"] = 1] = "Command";
    TeXElementType[TeXElementType["Section"] = 2] = "Section";
    TeXElementType[TeXElementType["SectionAst"] = 3] = "SectionAst";
    TeXElementType[TeXElementType["SubFile"] = 4] = "SubFile";
    TeXElementType[TeXElementType["BibItem"] = 5] = "BibItem";
    TeXElementType[TeXElementType["BibField"] = 6] = "BibField";
})(TeXElementType = exports.TeXElementType || (exports.TeXElementType = {}));
class StructureView {
    constructor() {
        this.structureChanged = new vscode.EventEmitter();
        this.structure = [];
        this.cachedTeX = undefined;
        this.cachedBib = undefined;
        this.cachedDTX = undefined;
        this.followCursor = true;
        this.onDidChangeTreeData = this.structureChanged.event;
        this.viewer = vscode.window.createTreeView('latex-workshop-structure', { treeDataProvider: this, showCollapseAll: true });
        vscode.commands.registerCommand('latex-workshop.structure-toggle-follow-cursor', () => {
            this.followCursor = !this.followCursor;
            logger.log(`Follow cursor is set to ${this.followCursor}.`);
        });
        vscode.workspace.onDidSaveTextDocument((e) => {
            // We don't check LaTeX ID as the reconstruct is handled by the Cacher.
            // We don't check BibTeX ID as the reconstruct is handled by the citation completer.
            if (lw.manager.hasDoctexId(e.languageId)) {
                void this.reconstruct();
            }
        });
        vscode.window.onDidChangeActiveTextEditor((e) => {
            if (!e) {
                return;
            }
            if (lw.manager.hasTexId(e.document.languageId)
                || lw.manager.hasBibtexId(e.document.languageId)
                || lw.manager.hasDoctexId(e.document.languageId)) {
                void this.refresh();
            }
        });
        vscode.workspace.onDidChangeConfiguration(async (ev) => {
            if (ev.affectsConfiguration('latex-workshop.view.outline.sections') ||
                ev.affectsConfiguration('latex-workshop.view.outline.commands')) {
                await parser_1.parser.reset();
                lw.cacher.allPaths.forEach(async (filePath) => {
                    const ast = lw.cacher.get(filePath)?.ast;
                    if (ast) {
                        await parser_1.parser.parseArgs(ast);
                    }
                });
                void this.reconstruct();
            }
        });
    }
    /**
     * Return the latex or bibtex structure
     *
     * @param force If `false` and some cached data exists for the corresponding file, use it. If `true`, always recompute the structure from disk
     */
    async build(force) {
        const document = vscode.window.activeTextEditor?.document;
        if (document?.languageId === 'doctex') {
            if (force || !this.cachedDTX || this.getCachedDataRootFileName(this.cachedDTX) !== document.fileName) {
                this.cachedDTX = undefined;
                this.cachedDTX = await (0, doctex_1.construct)(document);
                logger.log(`Structure ${force ? 'force ' : ''}updated with ${this.structure.length} entries for ${document.uri.fsPath} .`);
            }
            this.structure = this.cachedDTX;
        }
        else if (document?.languageId === 'bibtex') {
            if (force || !this.cachedBib || this.getCachedDataRootFileName(this.cachedBib) !== document.fileName) {
                this.cachedBib = undefined;
                this.cachedBib = await (0, bibtex_1.buildBibTeX)(document);
                logger.log(`Structure ${force ? 'force ' : ''}updated with ${this.structure.length} entries for ${document.uri.fsPath} .`);
            }
            this.structure = this.cachedBib;
        }
        else if (lw.manager.rootFile) {
            if (force || !this.cachedTeX) {
                this.cachedTeX = undefined;
                this.cachedTeX = await (0, latex_1.construct)();
                logger.log(`Structure ${force ? 'force ' : ''}updated with ${this.structure.length} root sections for ${lw.manager.rootFile} .`);
            }
            this.structure = this.cachedTeX;
        }
        else {
            this.structure = [];
            logger.log('Structure cleared on undefined root.');
        }
        return this.structure;
    }
    async reconstruct() {
        this.structure = await this.build(true);
        this.structureChanged.fire(undefined);
        lw.eventBus.fire(eventbus_1.StructureUpdated);
        return this.structure;
    }
    async refresh(fireChangedEvent = true) {
        this.structure = await this.build(false);
        if (fireChangedEvent) {
            this.structureChanged.fire(undefined);
            lw.eventBus.fire(eventbus_1.StructureUpdated);
        }
        return this.structure;
    }
    getCachedDataRootFileName(sections) {
        return sections[0]?.filePath;
    }
    traverseSectionTree(sections, filePath, lineNo) {
        for (const node of sections) {
            if ((node.filePath === filePath &&
                node.lineFr <= lineNo && node.lineTo >= lineNo) ||
                (node.filePath !== filePath && node.children.map(child => child.filePath).includes(filePath))) {
                // Look for a more precise surrounding section
                return this.traverseSectionTree(node.children, filePath, lineNo) ?? node;
            }
        }
        return undefined;
    }
    showCursorItem(e) {
        if (!this.followCursor || !this.viewer.visible) {
            return;
        }
        const line = e.selections[0].active.line;
        const f = e.textEditor.document.fileName;
        const currentNode = this.traverseSectionTree(this.structure, f, line);
        return currentNode ? this.viewer.reveal(currentNode, { select: true }) : undefined;
    }
    getTreeItem(element) {
        const treeItem = new vscode.TreeItem(element.label, element.children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded :
            vscode.TreeItemCollapsibleState.None);
        treeItem.command = {
            command: 'latex-workshop.goto-section',
            title: '',
            arguments: [element.filePath, element.lineFr]
        };
        treeItem.tooltip = `Line ${element.lineFr + 1} at ${element.filePath}`;
        return treeItem;
    }
    getChildren(element) {
        if (lw.manager.rootFile === undefined) {
            return [];
        }
        return element?.children ?? this.refresh(false);
    }
    getParent(element) {
        if (lw.manager.rootFile === undefined || !element) {
            return;
        }
        return element.parent;
    }
}
exports.StructureView = StructureView;
//# sourceMappingURL=structure.js.map