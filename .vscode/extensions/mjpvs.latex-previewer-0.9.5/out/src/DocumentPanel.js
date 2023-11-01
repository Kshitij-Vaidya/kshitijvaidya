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
exports.getWebviewOptions = exports.DocumentPanel = void 0;
const vscode = __importStar(require("vscode"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importStar(require("node:fs"));
const promises_1 = __importDefault(require("node:fs/promises"));
const util_1 = __importDefault(require("util"));
const decodeDviFile_1 = require("./decodeDviFile");
const synctexParser_1 = require("./synctexParser");
const opentype_js_1 = require("opentype.js");
const glyphPaths_1 = require("./glyphPaths");
const throttle_1 = __importDefault(require("lodash/throttle"));
const pageSizeMap = new Map([
    ["A3", { pageWidth: 297, pageHeight: 420 }],
    ["A4", { pageWidth: 210, pageHeight: 297 }],
    ["A5", { pageWidth: 148, pageHeight: 210 }],
    ["US Letter", { pageWidth: 216, pageHeight: 279 }],
    ["US Legal", { pageWidth: 216, pageHeight: 356 }]
]);
const mmToInchConv = 0.039370079;
class DocumentPanel {
    _resetPrivateVars() {
        this._synctex = undefined;
        this._synctexBlocksYSorted = undefined;
        this._documentSource = {};
        this._documentFonts = [];
        this._documentGlyphs = [];
        this._renderPages = [];
        this._renderedPages = [];
        this._renderingPage = [];
        this._webviewScrollYPos = 0;
        this._currentPageNo = 1;
        this._scrollLock = false;
    }
    ;
    static createOrShow(extensionUri, editor, fontMap, fontCachePath, dpi, pageSize, mag, pageBufferSize, pageGap, debugMode, outputChannel) {
        // If we already have a panel, show it.
        if (DocumentPanel.currentPanel) {
            DocumentPanel.currentPanel._panel.reveal(vscode.ViewColumn.Beside);
            DocumentPanel.currentPanel.pageBufferSize = pageBufferSize;
            DocumentPanel.currentPanel.pageGap = pageGap;
            DocumentPanel.currentPanel.debugMode = debugMode;
            DocumentPanel.currentPanel.dpi = dpi;
            DocumentPanel.currentPanel.mag = mag;
            DocumentPanel.currentPanel.marginPixels = Math.floor(dpi * (mag / 100));
            DocumentPanel.currentPanel._setPageDimensions();
            return;
        }
        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(DocumentPanel.viewType, 'LaTeX Preview', vscode.ViewColumn.Beside, getWebviewOptions(extensionUri));
        DocumentPanel.currentPanel = new DocumentPanel(panel, extensionUri, editor, fontMap, fontCachePath, dpi, pageSize, mag, pageBufferSize, pageGap, debugMode, outputChannel);
    }
    constructor(panel, extensionUri, editor, fontMap, fontCachePath, dpi, pageSize, mag, pageBufferSize, pageGap, debugMode, outputChannel) {
        this._disposables = [];
        this.scrollDocument = (0, throttle_1.default)((lineNo) => {
            if (this._scrollLock) {
                this._scrollLock = false;
                return;
            }
            if (lineNo <= 1) {
                this._panel.webview.postMessage({ type: 'scroll', value: { vpos: 0 } });
                return;
            }
            const xOffset = this._synctex?.offset.x || this.dpi;
            const yOffset = this._synctex?.offset.y || this.dpi;
            let minX = Number.MAX_SAFE_INTEGER;
            let maxY = 0;
            let currentPageIndex = 0;
            let pageIndex = 0;
            let pageTop = 0;
            let hBlocks = this._synctex?.blocks.filter(({ type, lineNumber }) => type === 'h' && lineNumber === lineNo);
            if (hBlocks && hBlocks.length > 0) {
                let leftmostBlock;
                let bottomBlock;
                hBlocks.forEach((block) => {
                    const w = block.width;
                    const h = block.height;
                    if (h > 0 && w > 0) {
                        if (block.left < minX) {
                            minX = block.left;
                            leftmostBlock = block;
                        }
                        if (currentPageIndex !== block.page - 1) {
                            currentPageIndex = block.page - 1;
                        }
                        pageTop = currentPageIndex * (this.pageHeightPixels + this.pageGap);
                        const y = yOffset + pageTop + block.bottom;
                        if (y > maxY) {
                            maxY = y;
                            bottomBlock = block;
                        }
                    }
                });
                const scrollBlock = (bottomBlock?.left === leftmostBlock?.left) ? bottomBlock : leftmostBlock;
                if (scrollBlock) {
                    const vPos = yOffset + pageTop + (scrollBlock.bottom - scrollBlock.height);
                    pageIndex = Math.floor(vPos / (this.pageHeightPixels + this.pageGap));
                    this._renderPagesFrom(pageIndex, this._getScrollDirection(vPos));
                    this._panel.webview.postMessage({ type: 'scroll', value: { vPos: vPos } });
                }
            }
            else { /* no h-blocks (could be a broken up long line) - look for glue elements instead */
                const glueElements = this._synctex?.blocks.filter(({ type, lineNumber }) => type === 'g' && lineNumber === lineNo);
                if (glueElements && glueElements.length > 0) {
                    const glueElement = glueElements[1];
                    if (glueElement) {
                        if (currentPageIndex !== glueElement.page - 1) {
                            currentPageIndex = glueElement.page - 1;
                        }
                        pageTop = currentPageIndex * (this.pageHeightPixels + this.pageGap);
                        const vPos = yOffset + pageTop + (glueElement.bottom - 15);
                        pageIndex = Math.floor(vPos / (this.pageHeightPixels + this.pageGap));
                        this._renderPagesFrom(pageIndex, this._getScrollDirection(vPos));
                        this._panel.webview.postMessage({ type: 'scroll', value: { vPos: vPos } });
                    }
                }
            }
        }, 50);
        this._panel = panel;
        this.editor = editor;
        this._extensionUri = extensionUri;
        this._previewStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._fontMap = fontMap;
        this._fontCachePath = fontCachePath;
        this.pageBufferSize = pageBufferSize;
        this.pageGap = pageGap;
        this.debugMode = debugMode;
        this.dpi = dpi;
        this.mag = mag;
        this.pageSize = pageSize;
        this.marginPixels = Math.floor(dpi * (mag / 100));
        const pageDimensions = pageSizeMap.get(pageSize);
        if (pageDimensions) {
            this.pageWidthPixels = Math.floor(pageDimensions.pageWidth * mmToInchConv * dpi * (mag / 100));
            this.pageHeightPixels = Math.floor(pageDimensions.pageHeight * mmToInchConv * dpi * (mag / 100));
        }
        else {
            this.pageWidthPixels = Math.floor(210 * mmToInchConv * dpi * (mag / 100));
            this.pageHeightPixels = Math.floor(297 * mmToInchConv * dpi * (mag / 100));
        }
        this._synctex = undefined;
        this._synctexBlocksYSorted = undefined;
        this._documentSource = {};
        this._documentFonts = [];
        this._glyphPaths = [];
        this._documentGlyphs = [];
        this._renderPages = [];
        this._renderedPages = [];
        this._renderingPage = [];
        this._webviewScrollYPos = 0;
        this._currentPageNo = 1;
        this._scrollLock = false;
        this._outputChannel = outputChannel;
        this._outputChannel.show(true);
        // Set the webview's initial html content
        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.onDidChangeViewState(e => {
            if (e.webviewPanel.active) {
                this._previewStatusBarItem.show();
            }
            else {
                this._previewStatusBarItem.hide();
            }
        }, null, this._disposables);
        this._panel.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'webviewScrolled':
                    this._webviewScrolled(message.scrollY);
                    return;
                case 'pageRendered':
                    this._renderedPages.push(message.pageIndex);
                    this._renderingPage[message.pageIndex] = false;
                    const pageIndex = this._renderPages.pop();
                    if (pageIndex) {
                        this._renderPage(pageIndex);
                    }
                    return;
            }
        }, null, this._disposables);
    }
    _updateStatus() {
        this._previewStatusBarItem.text =
            `Page ${this._currentPageNo}/${this._documentSource.pages.length} Size: ${this.pageSize} Mag: ${this.mag}% DPI: ${this.dpi}`;
    }
    pageSizeChanged() {
        this._setPageDimensions();
    }
    magnificationChanged() {
        this._setPageDimensions();
    }
    _setPageDimensions() {
        this.marginPixels = Math.floor(this.dpi * (this.mag / 100));
        const pageDimensions = pageSizeMap.get(this.pageSize);
        if (pageDimensions) {
            this.pageWidthPixels = Math.floor(pageDimensions.pageWidth * mmToInchConv * this.dpi * (this.mag / 100));
            this.pageHeightPixels = Math.floor(pageDimensions.pageHeight * mmToInchConv * this.dpi * (this.mag / 100));
        }
        else {
            this.pageWidthPixels = Math.floor(210 * mmToInchConv * this.dpi * (this.mag / 100));
            this.pageHeightPixels = Math.floor(297 * mmToInchConv * this.dpi * (this.mag / 100));
        }
    }
    async generateDocument(editor) {
        this._outputChannel.clear();
        this._resetPrivateVars();
        if (editor.document.fileName !== this.editor.document.fileName) {
            this._resetGlyphBitmaps();
        }
        this.editor = editor;
        const docPath = node_path_1.default.dirname(this.editor.document.fileName);
        const ext = node_path_1.default.extname(editor.document.fileName);
        const dviFileName = this.editor.document.fileName.replace(ext, '.dvi');
        if (node_fs_1.default.existsSync(dviFileName)) {
            node_fs_1.default.rmSync(dviFileName);
        }
        try {
            if (this.debugMode) {
                this._outputChannel.appendLine('Fonts found on this system:');
                this._fontMap.forEach((value, key) => {
                    this._outputChannel.appendLine(value + '/' + key);
                });
            }
            const exec = util_1.default.promisify(require('child_process').exec);
            const cmd = 'dvilualatex --halt-on-error --interaction=nonstopmode --synctex=-1 ' + this.editor.document.fileName;
            this._outputChannel.appendLine(cmd);
            const { stdout, stderr } = await exec(cmd, { cwd: docPath });
            if (this.debugMode) {
                this._outputChannel.appendLine(stdout);
            }
            if (stderr) {
                this._outputChannel.appendLine(stderr);
            }
            this._parseSyncTexFile(dviFileName.replace('.dvi', '.synctex'));
            this._outputChannel.appendLine('Decoding dvi file ' + dviFileName + ' ...');
            const json = await (0, decodeDviFile_1.decodeDviFile)(dviFileName, this._fontMap, this.dpi, this.mag, this.debugMode, this._outputChannel.appendLine);
            this._documentSource = JSON.parse(json);
            this._outputChannel.appendLine('Loading fonts ...');
            await this._loadFonts();
            this._outputChannel.appendLine('Rendering preview...');
            this._update();
            this._panel.webview.options = getWebviewOptions(this._extensionUri);
            this._initCanvas();
            for (let i = 0; i < this._documentSource.pages.length; i++) {
                this._renderingPage.push(false);
            }
            this._renderPagesFrom(0, 1);
            this._updateStatus();
        }
        catch (err) {
            if (err.stdout) {
                this._outputChannel.appendLine(err.stdout.toString());
            }
            this._outputChannel.appendLine(String(err));
            this._outputChannel.appendLine('Could not generate dvi file - review the log for errors.');
            this.dispose();
        }
    }
    async _loadFonts() {
        const fontPromises = this._documentSource?.fonts?.map(async (font) => {
            try { /* update the font cache */
                const src = node_path_1.default.join(font.fontPath, font.fontName);
                const dst = node_path_1.default.join(this._fontCachePath, font.fontName);
                await promises_1.default.copyFile(src, dst, node_fs_1.constants.COPYFILE_EXCL);
            }
            catch (err) {
                if (err.code !== 'EEXIST') {
                    this._outputChannel.appendLine(String(err));
                }
            }
            try { /* load the opentype.js Font objects */
                const otfFont = await (0, opentype_js_1.load)(this._fontCachePath + '/' + font.fontName);
                this._documentFonts[font.fontNum] = otfFont;
            }
            catch (err) {
                this._outputChannel.appendLine(String(err));
            }
        });
        return Promise.all(fontPromises);
    }
    _parseSyncTexFile(synctexFileName) {
        if (node_fs_1.default.existsSync(synctexFileName)) {
            this._outputChannel.appendLine('Parsing synctex file ' + synctexFileName + ' ...');
            const syncBody = node_fs_1.default.readFileSync(synctexFileName, { encoding: 'utf8' });
            if (syncBody && this.editor.document.fileName) {
                try {
                    const parsedSyncTex = (0, synctexParser_1.parseSyncTex)(syncBody, this.editor.document.fileName, this.dpi, this.mag);
                    this._synctex = parsedSyncTex;
                    this._synctex?.blocks.sort(({ lineNumber: a }, { lineNumber: b }) => a - b);
                    this._synctexBlocksYSorted = [...this._synctex?.blocks].sort(({ page: p1, bottom: b1 }, { page: p2, bottom: b2 }) => ((p1 * (this.pageHeightPixels + this.pageGap)) + b1) - ((p2 * (this.pageHeightPixels + this.pageGap)) + b2));
                }
                catch (err) {
                    this._outputChannel.appendLine(String(err));
                }
            }
        }
        else {
            this._outputChannel.appendLine('WARNING: No synctex file found. Scroll synchronization will be unavailable.');
        }
    }
    _initCanvas() {
        this._panel.webview.postMessage({
            type: 'initCanvas', value: {
                pageCount: this._documentSource.pages.length,
                marginPixels: this.marginPixels,
                pageWidth: this.pageWidthPixels,
                pageHeight: this.pageHeightPixels,
                pageGap: this.pageGap
            }
        });
    }
    _resetGlyphBitmaps() {
        this._panel.webview.postMessage({
            type: 'resetGlyphBitmaps', value: {}
        });
    }
    _renderPagesFrom(pageIndex, direction) {
        let pageCount = this.pageBufferSize;
        let nextPageIndex;
        do {
            nextPageIndex = (pageIndex + (pageCount * direction));
            if (!this._renderPages.includes(nextPageIndex) && this._renderingPage[nextPageIndex] === false && !this._renderedPages.includes(nextPageIndex)) {
                this._renderPages.push(nextPageIndex);
            }
            pageCount--;
        } while (pageCount > 0);
        if (this._renderingPage[pageIndex] === false && !this._renderedPages.includes(pageIndex)) {
            this._renderPage(pageIndex);
        }
        else {
            nextPageIndex = this._renderPages.pop();
            if (nextPageIndex) {
                this._renderPage(nextPageIndex);
            }
        }
    }
    _renderPage(pageIndex) {
        if (pageIndex >= 0 && pageIndex < this._documentSource.pages.length && this._renderingPage[pageIndex] === false && !this._renderedPages.includes(pageIndex)) {
            try {
                this._renderingPage[pageIndex] = true;
                const glyphData = (0, glyphPaths_1.getGlyphPaths)(this._documentSource.pages[pageIndex], this._documentFonts, this._glyphPaths);
                this._glyphPaths = glyphData.glyphPaths;
                this._documentGlyphs[pageIndex] = glyphData.pageGlyphs;
                this._panel.webview.postMessage({
                    type: 'renderPage',
                    value: {
                        pageIndex: pageIndex,
                        pageSource: this._documentSource.pages[pageIndex],
                        pageGlyphs: this._documentGlyphs[pageIndex]
                    }
                });
            }
            catch (err) {
                this._outputChannel.appendLine(String(err));
                this._renderingPage[pageIndex] = false;
            }
        }
    }
    _getScrollDirection(vPos) {
        return this._webviewScrollYPos < vPos ? 1 : this._webviewScrollYPos > vPos ? -1 : 0;
    }
    _webviewScrolled(scrollY) {
        if (scrollY === this._webviewScrollYPos) {
            return;
        }
        const pageIndex = Math.floor(scrollY / (this.pageHeightPixels + this.pageGap));
        this._currentPageNo = pageIndex + 1;
        this._updateStatus();
        this._renderPagesFrom(pageIndex, this._getScrollDirection(scrollY));
        const lineNumber = this._lineFromScrollPos(scrollY);
        if (lineNumber) {
            const revealRange = this._toRevealRange(lineNumber, this.editor);
            this._scrollLock = true;
            this.editor.revealRange(revealRange, vscode.TextEditorRevealType.AtTop);
        }
        this._webviewScrollYPos = scrollY;
    }
    _lineFromScrollPos(scrollY) {
        const yOffset = this._synctex?.offset.y || this.dpi;
        const pageIndex = Math.floor(scrollY / (this.pageHeightPixels + this.pageGap));
        const pageTop = (pageIndex * (this.pageHeightPixels + this.pageGap));
        let y = scrollY - (pageTop + yOffset);
        let lineIndex;
        if (this._synctexBlocksYSorted) {
            do {
                lineIndex = this._synctexBlocksYSorted.findIndex(({ page, bottom }) => page === pageIndex + 1 && bottom === y);
                y--;
            } while (lineIndex === -1 && y >= 0);
            if (lineIndex >= 0) {
                return this._synctexBlocksYSorted[lineIndex].lineNumber;
            }
        }
    }
    _toRevealRange(line, editor) {
        if (line >= editor.document.lineCount) {
            return new vscode.Range(editor.document.lineCount - 1, 0, editor.document.lineCount - 1, 0);
        }
        return new vscode.Range(line, 0, line + 1, 0);
    }
    getTopmostLine(editor) {
        if (!editor.visibleRanges.length) {
            return undefined;
        }
        const firstVisiblePosition = editor.visibleRanges[0].start;
        return firstVisiblePosition.line + 1;
    }
    dispose() {
        DocumentPanel.currentPanel = undefined;
        // Clean up our resources
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
    _update() {
        const webview = this._panel.webview;
        webview.html = this._getHtmlForWebview(webview);
        return;
    }
    _getHtmlForWebview(webview) {
        const webviewScriptPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'webviewFunctions.js');
        const webviewScriptUri = webview.asWebviewUri(webviewScriptPath);
        const styleResetPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'reset.css');
        const stylesPathMainPath = vscode.Uri.joinPath(this._extensionUri, 'out', 'vscode.css');
        const documentPath = DocumentPanel.documentPathUri ? webview.asWebviewUri(DocumentPanel.documentPathUri) : '';
        const stylesResetUri = webview.asWebviewUri(styleResetPath);
        const stylesMainUri = webview.asWebviewUri(stylesPathMainPath);
        // Use a nonce to only allow specific scripts to be run
        const nonce = getNonce();
        const init = `const documentPath = '${documentPath}';`;
        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src ${webview.cspSource}; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}'">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">				
				<link href="${stylesResetUri}" rel="stylesheet">
				<link href="${stylesMainUri}" rel="stylesheet">			
				<title>LaTeX Preview</title>
			</head>
			<body>
				<div class="menu" data-vscode-context='{"webviewSection": "menu", "preventDefaultContextMenuItems": true}'>
				<canvas id="cnv" height="10000" width="780"></canvas>
				</div>
				<script nonce="${nonce}">${init}</script>
				<script nonce="${nonce}" src="${webviewScriptUri}"></script>
			</body>
			</html>`;
    }
    async exportDocument() {
        this._outputChannel.clear();
        this._outputChannel.show();
        const srcFile = this.editor.document.fileName;
        const docPath = node_path_1.default.dirname(srcFile);
        const ext = node_path_1.default.extname(srcFile);
        const jsonFileName = srcFile.replace(ext, '.json');
        if (node_fs_1.default.existsSync(jsonFileName)) {
            node_fs_1.default.rmSync(jsonFileName);
        }
        try {
            const json = JSON.stringify(this._documentSource, null, 4);
            promises_1.default.writeFile(jsonFileName, json);
            const jsonFileLink = vscode.Uri.file(jsonFileName);
            this._outputChannel.appendLine('Document JSON written to ' + jsonFileLink);
        }
        catch (err) {
            this._outputChannel.appendLine(String(err));
            this._outputChannel.appendLine('Failed to write JSON file.');
        }
    }
}
exports.DocumentPanel = DocumentPanel;
DocumentPanel.viewType = 'latexPreview';
function getWebviewOptions(extensionUri) {
    let paths = [
        vscode.Uri.joinPath(extensionUri, 'out')
    ];
    if (DocumentPanel && DocumentPanel.documentPathUri) {
        paths.push(DocumentPanel.documentPathUri);
    }
    return {
        enableScripts: true,
        localResourceRoots: paths
    };
}
exports.getWebviewOptions = getWebviewOptions;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=DocumentPanel.js.map