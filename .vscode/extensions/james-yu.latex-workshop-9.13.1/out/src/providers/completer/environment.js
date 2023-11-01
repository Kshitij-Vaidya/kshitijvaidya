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
exports.Environment = exports.EnvSnippetType = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const lw = __importStar(require("../../lw"));
const completerutils_1 = require("./completerutils");
const logger_1 = require("../../components/logger");
const logger = (0, logger_1.getLogger)('Intelli', 'Environment');
function isEnv(obj) {
    return (typeof obj.name === 'string');
}
var EnvSnippetType;
(function (EnvSnippetType) {
    EnvSnippetType[EnvSnippetType["AsName"] = 0] = "AsName";
    EnvSnippetType[EnvSnippetType["AsCommand"] = 1] = "AsCommand";
    EnvSnippetType[EnvSnippetType["ForBegin"] = 2] = "ForBegin";
})(EnvSnippetType = exports.EnvSnippetType || (exports.EnvSnippetType = {}));
class Environment {
    constructor() {
        this.defaultEnvsAsName = [];
        this.defaultEnvsAsCommand = [];
        this.defaultEnvsForBegin = [];
        this.packageEnvs = new Map();
        this.packageEnvsAsName = new Map();
        this.packageEnvsAsCommand = new Map();
        this.packageEnvsForBegin = new Map();
        lw.registerDisposable(vscode.workspace.onDidChangeConfiguration((e) => {
            if (!e.affectsConfiguration('latex-workshop.intellisense.package.exclude')) {
                return;
            }
            this.initialize();
        }));
    }
    initialize() {
        const excludeDefault = vscode.workspace.getConfiguration('latex-workshop').get('intellisense.package.exclude').includes('lw-default');
        const envs = excludeDefault ? {} : JSON.parse(fs.readFileSync(`${lw.extensionRoot}/data/environments.json`, { encoding: 'utf8' }));
        Object.entries(envs).forEach(([key, env]) => {
            env.name = env.name || key;
            env.snippet = env.snippet || '';
            env.detail = key;
        });
        this.defaultEnvsAsCommand = [];
        this.defaultEnvsForBegin = [];
        this.defaultEnvsAsName = [];
        Object.entries(envs).forEach(([key, env]) => {
            this.defaultEnvsAsCommand.push(this.entryEnvToCompletion(key, env, EnvSnippetType.AsCommand));
            this.defaultEnvsForBegin.push(this.entryEnvToCompletion(key, env, EnvSnippetType.ForBegin));
            this.defaultEnvsAsName.push(this.entryEnvToCompletion(key, env, EnvSnippetType.AsName));
        });
        return this;
    }
    /**
     * This function is called by Command.initialize with type=EnvSnippetType.AsCommand
     * to build a `\envname` command for every default environment.
     */
    getDefaultEnvs(type) {
        switch (type) {
            case EnvSnippetType.AsName:
                return this.defaultEnvsAsName;
                break;
            case EnvSnippetType.AsCommand:
                return this.defaultEnvsAsCommand;
                break;
            case EnvSnippetType.ForBegin:
                return this.defaultEnvsForBegin;
                break;
            default:
                return [];
        }
    }
    getPackageEnvs(type) {
        switch (type) {
            case EnvSnippetType.AsName:
                return this.packageEnvsAsName;
            case EnvSnippetType.AsCommand:
                return this.packageEnvsAsCommand;
            case EnvSnippetType.ForBegin:
                return this.packageEnvsForBegin;
            default:
                return new Map();
        }
    }
    provideFrom(result, args) {
        const suggestions = this.provide(args.langId, args.line, args.position);
        // Commands starting with a non letter character are not filtered properly because of wordPattern definition.
        return (0, completerutils_1.filterNonLetterSuggestions)(suggestions, result[1], args.position);
    }
    provide(langId, line, position) {
        let snippetType = EnvSnippetType.ForBegin;
        if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.selections.length > 1 || line.slice(position.character).match(/[a-zA-Z*]*}/)) {
            snippetType = EnvSnippetType.AsName;
        }
        // Extract cached envs and add to default ones
        const suggestions = Array.from(this.getDefaultEnvs(snippetType));
        const envList = this.getDefaultEnvs(snippetType).map(env => env.label);
        // Insert package environments
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        if (configuration.get('intellisense.package.enabled')) {
            const packages = lw.completer.package.getPackagesIncluded(langId);
            Object.entries(packages).forEach(([packageName, options]) => {
                this.getEnvFromPkg(packageName, snippetType).forEach(env => {
                    if (env.option && options && !options.includes(env.option)) {
                        return;
                    }
                    if (!envList.includes(env.label)) {
                        suggestions.push(env);
                        envList.push(env.label);
                    }
                });
            });
        }
        // Insert environments defined in tex
        lw.cacher.getIncludedTeX().forEach(cachedFile => {
            const cachedEnvs = lw.cacher.get(cachedFile)?.elements.environment;
            if (cachedEnvs !== undefined) {
                cachedEnvs.forEach(env => {
                    if (!envList.includes(env.label)) {
                        if (snippetType === EnvSnippetType.ForBegin) {
                            env.insertText = new vscode.SnippetString(`${env.label}}\n\t$0\n\\end{${env.label}}`);
                        }
                        else {
                            env.insertText = env.label;
                        }
                        suggestions.push(env);
                        envList.push(env.label);
                    }
                });
            }
        });
        (0, completerutils_1.filterArgumentHint)(suggestions);
        return suggestions;
    }
    /**
     * Environments can be inserted using `\envname`.
     * This function is called by Command.provide to compute these commands for every package in use.
     */
    provideEnvsAsCommandInPkg(packageName, options, suggestions, defined) {
        defined = defined ?? new Set();
        const configuration = vscode.workspace.getConfiguration('latex-workshop');
        const useOptionalArgsEntries = configuration.get('intellisense.optionalArgsEntries.enabled');
        if (!configuration.get('intellisense.package.env.enabled')) {
            return;
        }
        // Load environments from the package if not already done
        const entry = this.getEnvFromPkg(packageName, EnvSnippetType.AsCommand);
        // No environment defined in package
        if (!entry || entry.length === 0) {
            return;
        }
        // Insert env snippets
        for (const env of entry) {
            if (!useOptionalArgsEntries && env.hasOptionalArgs()) {
                return;
            }
            if (!defined.has(env.signatureAsString())) {
                if (env.option && options && !options.includes(env.option)) {
                    return;
                }
                suggestions.push(env);
                defined.add(env.signatureAsString());
            }
        }
    }
    parse(cache) {
        if (cache.ast !== undefined) {
            cache.elements.environment = this.parseAst(cache.ast);
        }
        else {
            cache.elements.environment = this.parseContent(cache.contentTrimmed);
        }
    }
    parseAst(node) {
        let envs = [];
        if (node.type === 'environment' || node.type === 'mathenv') {
            const env = new completerutils_1.CmdEnvSuggestion(`${node.env}`, '', [], -1, { name: node.env, args: '' }, vscode.CompletionItemKind.Module);
            env.documentation = '`' + node.env + '`';
            env.filterText = node.env;
            envs.push(env);
        }
        const parseContent = (content) => {
            for (const subNode of content) {
                envs = [...envs, ...this.parseAst(subNode)];
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
        return envs;
    }
    parseContent(content) {
        const envReg = /\\begin\s?{([^{}]*)}/g;
        const envs = [];
        const envList = [];
        while (true) {
            const result = envReg.exec(content);
            if (result === null) {
                break;
            }
            if (envList.includes(result[1])) {
                continue;
            }
            const env = new completerutils_1.CmdEnvSuggestion(`${result[1]}`, '', [], -1, { name: result[1], args: '' }, vscode.CompletionItemKind.Module);
            env.documentation = '`' + result[1] + '`';
            env.filterText = result[1];
            envs.push(env);
            envList.push(result[1]);
        }
        return envs;
    }
    getEnvFromPkg(packageName, type) {
        const packageEnvs = this.getPackageEnvs(type);
        const entry = packageEnvs.get(packageName);
        if (entry !== undefined) {
            return entry;
        }
        lw.completer.loadPackageData(packageName);
        // No package command defined
        const pkgEnvs = this.packageEnvs.get(packageName);
        if (!pkgEnvs || pkgEnvs.length === 0) {
            return [];
        }
        const newEntry = [];
        pkgEnvs.forEach(env => {
            // \array{} : detail=array{}, name=array.
            newEntry.push(this.entryEnvToCompletion(env.detail || env.name, env, type));
        });
        packageEnvs.set(packageName, newEntry);
        return newEntry;
    }
    setPackageEnvs(packageName, envs) {
        const environments = [];
        Object.entries(envs).forEach(([key, env]) => {
            env.package = packageName;
            if (isEnv(env)) {
                environments.push(env);
            }
            else {
                logger.log(`Cannot parse intellisense file for ${packageName}`);
                logger.log(`Missing field in entry: "${key}": ${JSON.stringify(env)}`);
                delete envs[key];
            }
        });
        this.packageEnvs.set(packageName, environments);
    }
    entryEnvToCompletion(itemKey, item, type) {
        const label = item.detail ? item.detail : item.name;
        const suggestion = new completerutils_1.CmdEnvSuggestion(item.name, item.package || 'latex', item.keyvals && typeof (item.keyvals) !== 'number' ? item.keyvals : [], item.keyvalpos === undefined ? -1 : item.keyvalpos, (0, completerutils_1.splitSignatureString)(itemKey), vscode.CompletionItemKind.Module, item.option);
        suggestion.detail = `\\begin{${item.name}}${item.snippet?.replace(/\$\{\d+:([^$}]*)\}/g, '$1')}\n...\n\\end{${item.name}}`;
        suggestion.documentation = `Environment ${item.name} .`;
        if (item.package) {
            suggestion.documentation += ` From package: ${item.package}.`;
        }
        suggestion.sortText = label.replace(/^[a-zA-Z]/, c => {
            const n = c.match(/[a-z]/) ? c.toUpperCase().charCodeAt(0) : c.toLowerCase().charCodeAt(0);
            return n !== undefined ? n.toString(16) : c;
        });
        if (type === EnvSnippetType.AsName) {
            return suggestion;
        }
        else {
            if (type === EnvSnippetType.AsCommand) {
                suggestion.kind = vscode.CompletionItemKind.Snippet;
            }
            const configuration = vscode.workspace.getConfiguration('latex-workshop');
            const useTabStops = configuration.get('intellisense.useTabStops.enabled');
            const prefix = (type === EnvSnippetType.ForBegin) ? '' : 'begin{';
            let snippet = item.snippet ? item.snippet : '';
            if (item.snippet) {
                if (useTabStops) {
                    snippet = item.snippet.replace(/\$\{(\d+):[^}]*\}/g, '$${$1}');
                }
            }
            if (snippet.match(/\$\{?0\}?/)) {
                snippet = snippet.replace(/\$\{?0\}?/, '$${0:$${TM_SELECTED_TEXT}}');
                snippet += '\n';
            }
            else {
                snippet += '\n\t${0:${TM_SELECTED_TEXT}}\n';
            }
            if (item.detail) {
                suggestion.label = item.detail;
            }
            suggestion.filterText = itemKey;
            suggestion.insertText = new vscode.SnippetString(`${prefix}${item.name}}${snippet}\\end{${item.name}}`);
            return suggestion;
        }
    }
}
exports.Environment = Environment;
//# sourceMappingURL=environment.js.map