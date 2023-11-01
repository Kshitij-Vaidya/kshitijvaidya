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
exports.pdfViewerHookProvider = void 0;
const vscode = __importStar(require("vscode"));
const lw = __importStar(require("../../lw"));
const pdfviewermanager_1 = require("./pdfviewermanager");
const pdfviewerpanel_1 = require("./pdfviewerpanel");
class PdfViewerHookProvider {
    openCustomDocument(uri) {
        return {
            uri,
            dispose: () => { }
        };
    }
    async resolveCustomEditor(document, webviewPanel) {
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const viewerLocation = configuration.get('view.pdf.viewer', 'tab');
        if (viewerLocation === 'tab') {
            webviewPanel.webview.options = {
                ...webviewPanel.webview.options,
                enableScripts: true
            };
            const pdfPanel = await (0, pdfviewerpanel_1.populatePdfViewerPanel)(document.uri, webviewPanel);
            void pdfviewermanager_1.viewerManager.initiatePdfViewerPanel(pdfPanel);
        }
        else {
            webviewPanel.onDidChangeViewState(e => { e.webviewPanel.dispose(); });
            if (document.uri === undefined || !document.uri.fsPath.toLocaleLowerCase().endsWith('.pdf')) {
                return;
            }
            void lw.viewer.openPdfInTab(document.uri, 'current', false);
        }
    }
}
exports.pdfViewerHookProvider = new PdfViewerHookProvider();
//# sourceMappingURL=pdfviewerhook.js.map