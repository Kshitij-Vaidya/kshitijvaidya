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
exports.Glossary = void 0;
const vscode = __importStar(require("vscode"));
const lw = __importStar(require("../../lw"));
const parser_1 = require("../../utils/parser");
const utils_1 = require("../../utils/utils");
var GlossaryType;
(function (GlossaryType) {
    GlossaryType[GlossaryType["glossary"] = 0] = "glossary";
    GlossaryType[GlossaryType["acronym"] = 1] = "acronym";
})(GlossaryType || (GlossaryType = {}));
class Glossary {
    constructor() {
        // use object for deduplication
        this.glossaries = new Map();
        this.acronyms = new Map();
    }
    provideFrom(result) {
        return this.provide(result);
    }
    provide(result) {
        this.updateAll();
        let suggestions;
        if (result[1] && result[1].match(/^ac/i)) {
            suggestions = this.acronyms;
        }
        else {
            suggestions = new Map([...this.acronyms, ...this.glossaries]);
        }
        // Compile the suggestion object to array
        const items = Array.from(suggestions.values());
        return items;
    }
    getEntry(token) {
        this.updateAll();
        return this.glossaries.get(token) || this.acronyms.get(token);
    }
    updateAll() {
        // Extract cached references
        const glossaryList = [];
        lw.cacher.getIncludedTeX().forEach(cachedFile => {
            const cachedGlossaries = lw.cacher.get(cachedFile)?.elements.glossary;
            if (cachedGlossaries === undefined) {
                return;
            }
            cachedGlossaries.forEach(ref => {
                if (ref.type === GlossaryType.glossary) {
                    this.glossaries.set(ref.label, ref);
                }
                else {
                    this.acronyms.set(ref.label, ref);
                }
                glossaryList.push(ref.label);
            });
        });
        // Remove references that has been deleted
        this.glossaries.forEach((_, key) => {
            if (!glossaryList.includes(key)) {
                this.glossaries.delete(key);
            }
        });
        this.acronyms.forEach((_, key) => {
            if (!glossaryList.includes(key)) {
                this.acronyms.delete(key);
            }
        });
    }
    parse(cache) {
        if (cache.ast !== undefined) {
            cache.elements.glossary = this.parseAst(cache.ast, cache.filePath);
        }
        else {
            cache.elements.glossary = this.parseContent(cache.content, cache.filePath);
        }
    }
    parseAst(node, filePath) {
        let glos = [];
        let entry = { label: '', description: '' };
        let type;
        if (node.type === 'macro' && ['newglossaryentry', 'provideglossaryentry'].includes(node.content)) {
            type = GlossaryType.glossary;
            let description = (0, parser_1.argContentToStr)(node.args?.[1]?.content || [], true);
            const index = description.indexOf('description=');
            if (index >= 0) {
                description = description.slice(index + 12);
                if (description.charAt(0) === '{') {
                    description = (0, utils_1.getLongestBalancedString)(description) ?? '';
                }
                else {
                    description = description.split(',')[0] ?? '';
                }
            }
            else {
                description = '';
            }
            entry = {
                label: (0, parser_1.argContentToStr)(node.args?.[0]?.content || []),
                description
            };
        }
        else if (node.type === 'macro' && ['longnewglossaryentry', 'longprovideglossaryentry', 'newacronym', 'newabbreviation', 'newabbr'].includes(node.content)) {
            if (['longnewglossaryentry', 'longprovideglossaryentry'].includes(node.content)) {
                type = GlossaryType.glossary;
            }
            else {
                type = GlossaryType.acronym;
            }
            entry = {
                label: (0, parser_1.argContentToStr)(node.args?.[1]?.content || []),
                description: (0, parser_1.argContentToStr)(node.args?.[3]?.content || []),
            };
        }
        if (type !== undefined && entry.label && entry.description && node.position !== undefined) {
            glos.push({
                type,
                filePath,
                position: new vscode.Position(node.position.start.line - 1, node.position.start.column - 1),
                label: entry.label,
                detail: entry.description,
                kind: vscode.CompletionItemKind.Reference
            });
        }
        const parseContent = (content) => {
            for (const subNode of content) {
                glos = [...glos, ...this.parseAst(subNode, filePath)];
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
        return glos;
    }
    parseContent(content, filePath) {
        const glossaries = [];
        const glossaryList = [];
        // We assume that the label is always result[1] and use getDescription(result) for the description
        const regexes = {
            'glossary': {
                regex: /\\(?:provide|new)glossaryentry{([^{}]*)}\s*{(?:(?!description).)*description=(?:([^{},]*)|{([^{}]*))[,}]/gms,
                type: GlossaryType.glossary,
                getDescription: (result) => { return result[2] ? result[2] : result[3]; }
            },
            'longGlossary': {
                regex: /\\long(?:provide|new)glossaryentry{([^{}]*)}\s*{[^{}]*}\s*{([^{}]*)}/gms,
                type: GlossaryType.glossary,
                getDescription: (result) => { return result[2]; }
            },
            'acronym': {
                regex: /\\newacronym(?:\[[^[\]]*\])?{([^{}]*)}{[^{}]*}{([^{}]*)}/gm,
                type: GlossaryType.acronym,
                getDescription: (result) => { return result[2]; }
            }
        };
        for (const key in regexes) {
            while (true) {
                const result = regexes[key].regex.exec(content);
                if (result === null) {
                    break;
                }
                const positionContent = content.substring(0, result.index).split('\n');
                if (glossaryList.includes(result[1])) {
                    continue;
                }
                glossaries.push({
                    type: regexes[key].type,
                    filePath,
                    position: new vscode.Position(positionContent.length - 1, positionContent[positionContent.length - 1].length),
                    label: result[1],
                    detail: regexes[key].getDescription(result),
                    kind: vscode.CompletionItemKind.Reference
                });
            }
        }
        return glossaries;
    }
}
exports.Glossary = Glossary;
//# sourceMappingURL=glossary.js.map