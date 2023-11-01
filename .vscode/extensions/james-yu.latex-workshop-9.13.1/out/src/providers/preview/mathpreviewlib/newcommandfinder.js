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
exports.findProjectNewCommand = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const lw = __importStar(require("../../../lw"));
const utils_1 = require("../../../utils/utils");
const logger_1 = require("../../../components/logger");
const logger = (0, logger_1.getLogger)('Preview', 'Math');
async function findProjectNewCommand(ctoken) {
    const configuration = vscode.workspace.getConfiguration('latex-workshop');
    const newCommandFile = configuration.get('hover.preview.newcommand.newcommandFile');
    let commandsInConfigFile = '';
    if (newCommandFile !== '') {
        commandsInConfigFile = await loadNewCommandFromConfigFile(newCommandFile);
    }
    if (!configuration.get('hover.preview.newcommand.parseTeXFile.enabled')) {
        return commandsInConfigFile;
    }
    let commands = [];
    for (const tex of lw.cacher.getIncludedTeX()) {
        if (ctoken?.isCancellationRequested) {
            return '';
        }
        await lw.cacher.wait(tex);
        const content = lw.cacher.get(tex)?.content;
        if (content === undefined) {
            continue;
        }
        commands = commands.concat(findNewCommand(content));
    }
    return commandsInConfigFile + '\n' + postProcessNewCommands(commands.join(''));
}
exports.findProjectNewCommand = findProjectNewCommand;
function postProcessNewCommands(commands) {
    return commands.replace(/\\providecommand/g, '\\newcommand')
        .replace(/\\newcommand\*/g, '\\newcommand')
        .replace(/\\renewcommand\*/g, '\\renewcommand')
        .replace(/\\DeclarePairedDelimiter{(\\[a-zA-Z]+)}{([^{}]*)}{([^{}]*)}/g, '\\newcommand{$1}[2][]{#1$2 #2 #1$3}');
}
async function loadNewCommandFromConfigFile(newCommandFile) {
    let commandsString = '';
    if (newCommandFile === '') {
        return commandsString;
    }
    let newCommandFileAbs;
    if (path.isAbsolute(newCommandFile)) {
        newCommandFileAbs = newCommandFile;
    }
    else {
        if (lw.manager.rootFile === undefined) {
            await lw.manager.findRoot();
        }
        const rootDir = lw.manager.rootDir;
        if (rootDir === undefined) {
            logger.log(`Cannot identify the absolute path of new command file ${newCommandFile} without root file.`);
            return '';
        }
        newCommandFileAbs = path.join(rootDir, newCommandFile);
    }
    commandsString = lw.lwfs.readFileSyncGracefully(newCommandFileAbs);
    if (commandsString === undefined) {
        logger.log(`Cannot read file ${newCommandFileAbs}`);
        return '';
    }
    commandsString = commandsString.replace(/^\s*$/gm, '');
    commandsString = postProcessNewCommands(commandsString);
    return commandsString;
}
function findNewCommand(content) {
    const commands = [];
    const regex = /(\\(?:(?:(?:(?:re)?new|provide)command|DeclareMathOperator)(\*)?{\\[a-zA-Z]+}(?:\[[^[\]{}]*\])*{.*})|\\(?:def\\[a-zA-Z]+(?:#[0-9])*{.*})|\\DeclarePairedDelimiter{\\[a-zA-Z]+}{[^{}]*}{[^{}]*})/gm;
    const noCommentContent = (0, utils_1.stripCommentsAndVerbatim)(content);
    let result;
    do {
        result = regex.exec(noCommentContent);
        if (result) {
            let command = result[1];
            if (result[2]) {
                command = command.replace('*', '');
            }
            commands.push(command);
        }
    } while (result);
    return commands;
}
//# sourceMappingURL=newcommandfinder.js.map