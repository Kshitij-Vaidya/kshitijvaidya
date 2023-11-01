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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = __importStar(require("vscode"));
const node_fs_1 = __importDefault(require("node:fs"));
const get_system_fonts_1 = __importDefault(require("get-system-fonts"));
const node_path_1 = __importDefault(require("node:path"));
const DocumentPanel_1 = require("./DocumentPanel");
const generatePdf_1 = require("./generatePdf");
const pageSizes = ["A5", "A4", "A3", "US Letter", "US Legal"];
let outputChannel;
module.exports.activate = async (context) => {
    if (vscode.window.activeTextEditor?.document?.fileName) {
        const editor = vscode.window.activeTextEditor;
        const ext = node_path_1.default.extname(editor.document.fileName);
        if (ext === '.tex' || ext === '.latex') {
            const config = vscode.workspace.getConfiguration('latexPreview');
            const latexFontDir = config?.get('latexFontDir') ?? '';
            const fontFiles = await (0, get_system_fonts_1.default)({ additionalFolders: [latexFontDir], extensions: ['ttf', 'otf'] });
            const fontMap = new Map();
            fontFiles?.forEach(fontFile => {
                fontMap.set(node_path_1.default.basename(fontFile), node_path_1.default.dirname(fontFile));
            });
            outputChannel = vscode.window.createOutputChannel('LaTeX Preview');
            const fontCachePath = node_path_1.default.join(context.extensionUri.fsPath, 'font-cache');
            if (!node_fs_1.default.existsSync(fontCachePath)) {
                node_fs_1.default.mkdirSync(fontCachePath);
            }
            /* Check the version of the luaotfload package */
            const logFileName = editor.document.fileName.replace(ext, '.log');
            if (node_fs_1.default.existsSync(logFileName)) {
                const logFileStr = node_fs_1.default.readFileSync(logFileName, 'utf8');
                if (logFileStr) {
                    const strPos = logFileStr.indexOf('Lua module: luaotfload');
                    if (strPos > -1) {
                        const luaOtfLoadStr = logFileStr.substring(strPos, strPos + 39);
                        const luaOtfLoadVerStr = luaOtfLoadStr.substring(luaOtfLoadStr.length - 5, luaOtfLoadStr.length);
                        const luaOtfLoadVer = Number.parseFloat(luaOtfLoadVerStr);
                        if (luaOtfLoadVer < 3.23) {
                            vscode.window.showWarningMessage('luaotfload package older than v3.23 detected. Fonts may not be loaded correctly.');
                        }
                    }
                }
            }
            let disposable = vscode.commands.registerCommand('latex-preview.preview', () => {
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    DocumentPanel_1.DocumentPanel.documentPathUri = vscode.Uri.file(node_path_1.default.dirname(editor.document.fileName));
                    const config = vscode.workspace.getConfiguration('latexPreview');
                    const dpi = config?.get('dpi') ?? 96;
                    const pageSize = config?.get('pageSize') ?? "A4";
                    const mag = config?.get('mag') ?? 100;
                    const debugMode = config?.get('debugMode') ?? false;
                    const pageBufferSize = config?.get('pageBufferSize') ?? 2;
                    const pageGap = config?.get('pageGap') ?? 0;
                    DocumentPanel_1.DocumentPanel.createOrShow(context.extensionUri, editor, fontMap, fontCachePath, dpi, pageSize, mag, pageBufferSize, pageGap, debugMode, outputChannel);
                    if (DocumentPanel_1.DocumentPanel.currentPanel) {
                        DocumentPanel_1.DocumentPanel.currentPanel.generateDocument(editor);
                    }
                }
            });
            context.subscriptions.push(disposable);
            disposable = vscode.commands.registerCommand('latex-preview.generatePdf', () => {
                if (vscode.window.activeTextEditor?.document?.fileName) {
                    const editor = vscode.window.activeTextEditor;
                    const ext = node_path_1.default.extname(editor.document.fileName);
                    if (ext === '.tex' || ext === '.latex') {
                        (0, generatePdf_1.generatePdf)(editor.document.fileName, outputChannel);
                    }
                }
            });
            context.subscriptions.push(disposable);
            disposable = vscode.window.onDidChangeTextEditorVisibleRanges(e => {
                if (e.textEditor?.document?.fileName === DocumentPanel_1.DocumentPanel.currentPanel?.editor?.document?.fileName) {
                    const topmostLineNumber = DocumentPanel_1.DocumentPanel.currentPanel.getTopmostLine(e.textEditor);
                    if (topmostLineNumber) {
                        DocumentPanel_1.DocumentPanel.currentPanel.scrollDocument(topmostLineNumber);
                    }
                }
            });
            context.subscriptions.push(disposable);
            disposable = vscode.workspace.onDidSaveTextDocument(async (e) => {
                if (vscode.window.activeTextEditor && e.fileName === DocumentPanel_1.DocumentPanel.currentPanel?.editor?.document?.fileName) {
                    DocumentPanel_1.DocumentPanel.currentPanel.generateDocument(vscode.window.activeTextEditor);
                }
            });
            context.subscriptions.push(disposable);
            disposable = vscode.commands.registerCommand('latex-preview.setPageSize', async () => {
                if (DocumentPanel_1.DocumentPanel.currentPanel?.editor) {
                    const pageSize = await vscode.window.showQuickPick(pageSizes, { title: "Select a page size...", placeHolder: DocumentPanel_1.DocumentPanel.currentPanel.pageSize, ignoreFocusOut: true, canPickMany: false });
                    if (pageSize) {
                        DocumentPanel_1.DocumentPanel.currentPanel.pageSize = pageSize;
                        DocumentPanel_1.DocumentPanel.currentPanel.pageSizeChanged();
                        DocumentPanel_1.DocumentPanel.currentPanel.generateDocument(DocumentPanel_1.DocumentPanel.currentPanel.editor);
                    }
                }
            });
            context.subscriptions.push(disposable);
            disposable = vscode.commands.registerCommand('latex-preview.magIncrease', () => {
                if (DocumentPanel_1.DocumentPanel.currentPanel?.editor) {
                    DocumentPanel_1.DocumentPanel.currentPanel.mag += 10;
                    DocumentPanel_1.DocumentPanel.currentPanel.magnificationChanged();
                    DocumentPanel_1.DocumentPanel.currentPanel.generateDocument(DocumentPanel_1.DocumentPanel.currentPanel.editor);
                }
            });
            context.subscriptions.push(disposable);
            disposable = vscode.commands.registerCommand('latex-preview.magDecrease', () => {
                if (DocumentPanel_1.DocumentPanel.currentPanel?.editor) {
                    DocumentPanel_1.DocumentPanel.currentPanel.mag -= 10;
                    DocumentPanel_1.DocumentPanel.currentPanel.magnificationChanged();
                    DocumentPanel_1.DocumentPanel.currentPanel.generateDocument(DocumentPanel_1.DocumentPanel.currentPanel.editor);
                }
            });
            context.subscriptions.push(disposable);
            disposable = vscode.commands.registerCommand('latex-preview.setMagnification', async () => {
                if (DocumentPanel_1.DocumentPanel.currentPanel?.editor) {
                    const mag = await vscode.window.showInputBox({ title: "Enter magnification value (%)...",
                        validateInput: (value) => {
                            const val = parseInt(value);
                            if (Number.isNaN(val) || val < 50 || val > 200) {
                                return "Enter a integer value between 50 an 200";
                            }
                        },
                        placeHolder: DocumentPanel_1.DocumentPanel.currentPanel.mag.toString(),
                        ignoreFocusOut: true });
                    if (mag) {
                        DocumentPanel_1.DocumentPanel.currentPanel.mag = parseInt(mag);
                        DocumentPanel_1.DocumentPanel.currentPanel.magnificationChanged();
                        DocumentPanel_1.DocumentPanel.currentPanel.generateDocument(DocumentPanel_1.DocumentPanel.currentPanel.editor);
                    }
                }
            });
            context.subscriptions.push(disposable);
            disposable = vscode.commands.registerCommand('latex-preview.exportDocument', () => {
                if (DocumentPanel_1.DocumentPanel.currentPanel?.editor) {
                    DocumentPanel_1.DocumentPanel.currentPanel.exportDocument();
                }
            });
            context.subscriptions.push(disposable);
        }
    }
};
module.exports.deactivate = () => {
    outputChannel.dispose();
};
//# sourceMappingURL=extension.js.map