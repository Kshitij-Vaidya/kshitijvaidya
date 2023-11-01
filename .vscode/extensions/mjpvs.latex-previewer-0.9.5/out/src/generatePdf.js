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
exports.generatePdf = void 0;
const vscode = __importStar(require("vscode"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const util_1 = __importDefault(require("util"));
async function generatePdf(srcFile, outputChannel) {
    outputChannel.clear();
    outputChannel.show();
    const docPath = node_path_1.default.dirname(srcFile);
    const ext = node_path_1.default.extname(srcFile);
    const pdfFileName = srcFile.replace(ext, '.pdf');
    if (node_fs_1.default.existsSync(pdfFileName)) {
        node_fs_1.default.rmSync(pdfFileName);
    }
    try {
        const exec = util_1.default.promisify(require('child_process').exec);
        const cmd = 'lualatex --halt-on-error --interaction=nonstopmode ' + srcFile;
        outputChannel.appendLine(cmd);
        const { stdout, stderr } = await exec(cmd, { cwd: docPath });
        outputChannel.appendLine(stdout);
        if (stderr) {
            outputChannel.appendLine(stderr);
        }
        outputChannel.appendLine('Done.');
        const pdfFileLink = vscode.Uri.file(pdfFileName);
        outputChannel.appendLine('PDF written to ' + pdfFileLink);
    }
    catch (err) {
        if (err.stdout) {
            outputChannel.appendLine(err.stdout.toString());
        }
        outputChannel.appendLine(String(err));
        outputChannel.appendLine('Could not generate pdf file - review the log for errors.');
    }
}
exports.generatePdf = generatePdf;
//# sourceMappingURL=generatePdf.js.map