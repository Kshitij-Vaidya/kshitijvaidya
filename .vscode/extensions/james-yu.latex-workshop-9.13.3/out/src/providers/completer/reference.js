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
exports.Reference = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const lw = __importStar(require("../../lw"));
const utils_1 = require("../../utils/utils");
const completerutils_1 = require("./completerutils");
const parser_1 = require("../../utils/parser");
class Reference {
    constructor() {
        // Here we use an object instead of an array for de-duplication
        this.suggestions = new Map();
        this.prevIndexObj = new Map();
    }
    provideFrom(_result, args) {
        return this.provide(args.line, args.position);
    }
    provide(line, position) {
        // Compile the suggestion object to array
        this.updateAll(line, position);
        let keys = [...this.suggestions.keys(), ...this.prevIndexObj.keys()];
        keys = Array.from(new Set(keys));
        const items = [];
        for (const key of keys) {
            const sug = this.suggestions.get(key);
            if (sug) {
                const data = {
                    documentation: sug.documentation,
                    file: sug.file,
                    position: {
                        line: sug.position.line,
                        character: sug.position.character
                    },
                    key,
                    label: sug.label,
                    prevIndex: sug.prevIndex
                };
                sug.documentation = JSON.stringify(data);
                items.push(sug);
            }
            else {
                items.push({ label: key });
            }
        }
        return items;
    }
    getRef(token) {
        this.updateAll();
        return this.suggestions.get(token);
    }
    updateAll(line, position) {
        if (!lw.manager.rootFile) {
            this.suggestions.clear();
            return;
        }
        const included = new Set([lw.manager.rootFile]);
        // Included files may originate from \input or `xr`. If the latter, a
        // prefix may be used to ref to the file. The following obj holds them.
        const prefixes = {};
        while (true) {
            // The process adds newly included file recursively, only stops when
            // all have been found, i.e., no new ones
            const startSize = included.size;
            included.forEach(cachedFile => {
                lw.cacher.getIncludedTeX(cachedFile).forEach(includedTeX => {
                    if (includedTeX === cachedFile) {
                        return;
                    }
                    included.add(includedTeX);
                    // If the file is indeed included by \input, but was
                    // previously included by `xr`, the possible prefix is
                    // removed as it can be directly referenced without.
                    delete prefixes[includedTeX];
                });
                const cache = lw.cacher.get(cachedFile);
                if (!cache) {
                    return;
                }
                Object.keys(cache.external).forEach(external => {
                    // Don't repeatedly add, no matter previously by \input or
                    // `xr`
                    if (included.has(external)) {
                        return;
                    }
                    // If the file is included by `xr`, both file path and
                    // prefix is recorded.
                    included.add(external);
                    prefixes[external] = cache.external[external];
                });
            });
            if (included.size === startSize) {
                break;
            }
        }
        // Extract cached references
        const refList = [];
        let range = undefined;
        if (line && position) {
            range = (0, completerutils_1.computeFilteringRange)(line, position);
        }
        included.forEach(cachedFile => {
            const cachedRefs = lw.cacher.get(cachedFile)?.elements.reference;
            if (cachedRefs === undefined) {
                return;
            }
            cachedRefs.forEach(ref => {
                if (ref.range === undefined) {
                    return;
                }
                const label = (cachedFile in prefixes ? prefixes[cachedFile] : '') + ref.label;
                this.suggestions.set(label, { ...ref,
                    label,
                    file: cachedFile,
                    position: 'inserting' in ref.range ? ref.range.inserting.start : ref.range.start,
                    range,
                    prevIndex: this.prevIndexObj.get(label)
                });
                refList.push(label);
            });
        });
        // Remove references that have been deleted
        this.suggestions.forEach((_, key) => {
            if (!refList.includes(key)) {
                this.suggestions.delete(key);
            }
        });
    }
    parse(cache) {
        if (cache.ast !== undefined) {
            const configuration = vscode.workspace.getConfiguration('latex-workshop');
            const labelMacros = configuration.get('intellisense.label.command');
            cache.elements.reference = this.parseAst(cache.ast, cache.content.split('\n'), labelMacros);
        }
        else {
            cache.elements.reference = this.parseContent(cache.content);
        }
    }
    parseAst(node, lines, labelMacros) {
        let refs = [];
        if (node.type === 'macro' &&
            ['renewcommand', 'newcommand', 'providecommand', 'DeclareMathOperator', 'renewenvironment', 'newenvironment'].includes(node.content)) {
            // Do not scan labels inside \newcommand, \newenvironment & co
            return [];
        }
        if (node.type === 'environment' && ['tikzpicture'].includes(node.env)) {
            return [];
        }
        let label = '';
        if (node.type === 'macro' && labelMacros.includes(node.content)) {
            label = (0, parser_1.argContentToStr)(node.args?.[1]?.content || []);
        }
        else if (node.type === 'environment' && ['frame'].includes(node.env)) {
            label = (0, parser_1.argContentToStr)(node.args?.[1]?.content || []);
            const index = label.indexOf('label=');
            if (index >= 0) {
                label = label.slice(index + 6);
                if (label.charAt(0) === '{') {
                    label = (0, utils_1.getLongestBalancedString)(label) ?? '';
                }
                else {
                    label = label.split(',')[0] ?? '';
                }
            }
            else {
                label = '';
            }
        }
        if (label !== '' && node.position !== undefined) {
            refs.push({
                label,
                kind: vscode.CompletionItemKind.Reference,
                // One row before, four rows after
                documentation: lines.slice(node.position.start.line - 2, node.position.end.line + 4).join('\n'),
                // Here we abuse the definition of range to store the location of the reference definition
                range: new vscode.Range(node.position.start.line - 1, node.position.start.column - 1, node.position.end.line - 1, node.position.end.column - 1)
            });
        }
        const parseContent = (content) => {
            for (const subNode of content) {
                refs = [...refs, ...this.parseAst(subNode, lines, labelMacros)];
            }
        };
        if (node.type === 'macro' && node.args) {
            for (const arg of node.args) {
                parseContent(arg.content);
            }
        }
        else if ('content' in node && typeof node.content !== 'string') {
            parseContent(node.content);
        }
        return refs;
    }
    parseContent(content) {
        const refReg = /(?:\\label(?:\[[^[\]{}]*\])?|(?:^|[,\s])label=){([^#\\}]*)}/gm;
        const refs = [];
        const refList = [];
        content = (0, utils_1.stripEnvironments)(content, ['']);
        while (true) {
            const result = refReg.exec(content);
            if (result === null) {
                break;
            }
            if (refList.includes(result[1])) {
                continue;
            }
            const prevContent = content.substring(0, content.substring(0, result.index).lastIndexOf('\n') - 1);
            const followLength = content.substring(result.index, content.length).split('\n', 4).join('\n').length;
            const positionContent = content.substring(0, result.index).split('\n');
            refs.push({
                label: result[1],
                kind: vscode.CompletionItemKind.Reference,
                // One row before, four rows after
                documentation: content.substring(prevContent.lastIndexOf('\n') + 1, result.index + followLength),
                // Here we abuse the definition of range to store the location of the reference definition
                range: new vscode.Range(positionContent.length - 1, positionContent[positionContent.length - 1].length, positionContent.length - 1, positionContent[positionContent.length - 1].length)
            });
            refList.push(result[1]);
        }
        return refs;
    }
    setNumbersFromAuxFile(rootFile) {
        const outDir = lw.manager.getOutDir(rootFile);
        const rootDir = path.dirname(rootFile);
        const auxFile = path.resolve(rootDir, path.join(outDir, path.basename(rootFile, '.tex') + '.aux'));
        this.suggestions.forEach((entry) => {
            entry.prevIndex = undefined;
        });
        this.prevIndexObj = new Map();
        if (!fs.existsSync(auxFile)) {
            return;
        }
        const newLabelReg = /^\\newlabel\{(.*?)\}\{\{(.*?)\}\{(.*?)\}/gm;
        const auxContent = fs.readFileSync(auxFile, { encoding: 'utf8' });
        while (true) {
            const result = newLabelReg.exec(auxContent);
            if (result === null) {
                break;
            }
            if (result[1].endsWith('@cref') && this.prevIndexObj.has(result[1].replace('@cref', ''))) {
                // Drop extra \newlabel entries added by cleveref
                continue;
            }
            this.prevIndexObj.set(result[1], { refNumber: result[2], pageNumber: result[3] });
            const ent = this.suggestions.get(result[1]);
            if (ent) {
                ent.prevIndex = { refNumber: result[2], pageNumber: result[3] };
            }
        }
    }
}
exports.Reference = Reference;
//# sourceMappingURL=reference.js.map