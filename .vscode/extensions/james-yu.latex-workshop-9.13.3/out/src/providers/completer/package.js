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
exports.Package = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const lw = __importStar(require("../../lw"));
const parser_1 = require("../../utils/parser");
const pathutils_1 = require("../../components/cacherlib/pathutils");
class Package {
    constructor() {
        this.suggestions = [];
        this.packageDeps = {};
        this.packageOptions = {};
    }
    initialize(defaultPackages) {
        Object.values(defaultPackages).forEach(item => {
            const pack = new vscode.CompletionItem(item.command, vscode.CompletionItemKind.Module);
            pack.detail = item.detail;
            pack.documentation = new vscode.MarkdownString(`[${item.documentation}](${item.documentation})`);
            this.suggestions.push(pack);
        });
    }
    provideFrom() {
        return this.provide();
    }
    provide() {
        if (this.suggestions.length === 0) {
            const pkgs = JSON.parse(fs.readFileSync(`${lw.extensionRoot}/data/packagenames.json`).toString());
            this.initialize(pkgs);
        }
        return this.suggestions;
    }
    setPackageDeps(packageName, deps) {
        this.packageDeps[packageName] = deps;
    }
    setPackageOptions(packageName, options) {
        this.packageOptions[packageName] = options;
    }
    getPackageOptions(packageName) {
        return this.packageOptions[packageName] || [];
    }
    getPackageDeps(packageName) {
        return this.packageDeps[packageName] || {};
    }
    getPackagesIncluded(languageId) {
        const packages = {};
        const config = vscode.workspace.getConfiguration('latex-workshop');
        const excluded = config.get('intellisense.package.exclude');
        if (!excluded.includes('lw-default')) {
            if (['latex', 'latex-expl3'].includes(languageId)) {
                packages['latex-document'] = [];
            }
            if (languageId === 'latex-expl3') {
                packages['expl3'] = [];
            }
        }
        config.get('intellisense.package.extra')
            .filter(packageName => !excluded.includes(packageName))
            .forEach(packageName => packages[packageName] = []);
        lw.cacher.getIncludedTeX().forEach(tex => {
            const included = lw.cacher.get(tex)?.elements.package;
            if (included === undefined) {
                return;
            }
            Object.entries(included)
                .filter(([packageName,]) => !excluded.includes(packageName))
                .forEach(([packageName, options]) => packages[packageName] = options);
        });
        while (true) {
            let newPackageInserted = false;
            Object.entries(packages).forEach(([packageName, options]) => Object.keys(this.getPackageDeps(packageName))
                .filter(includeName => !excluded.includes(includeName))
                .forEach(includeName => {
                const dependOptions = this.getPackageDeps(packageName)[includeName];
                const hasOption = dependOptions.length === 0
                    || options.filter(option => dependOptions.includes(option)).length > 0;
                if (packages[includeName] === undefined && hasOption) {
                    packages[includeName] = [];
                    newPackageInserted = true;
                }
            }));
            if (!newPackageInserted) {
                break;
            }
        }
        return packages;
    }
    parse(cache) {
        if (cache.ast !== undefined) {
            cache.elements.package = this.parseAst(cache.ast);
        }
        else {
            cache.elements.package = this.parseContent(cache.content);
        }
    }
    parseAst(node) {
        const packages = {};
        if (node.type === 'macro' && ['usepackage', 'documentclass'].includes(node.content)) {
            const options = (0, parser_1.argContentToStr)(node.args?.[0]?.content || [])
                .split(',')
                .map(arg => arg.trim());
            const optionsNoTrue = options
                .filter(option => option.includes('=true'))
                .map(option => option.replace('=true', ''));
            (0, parser_1.argContentToStr)(node.args?.[1]?.content || [])
                .split(',')
                .map(packageName => this.toPackageObj(packageName.trim(), [...options, ...optionsNoTrue], node))
                .forEach(packageObj => Object.assign(packages, packageObj));
        }
        else if ('content' in node && typeof node.content !== 'string') {
            for (const subNode of node.content) {
                Object.assign(packages, this.parseAst(subNode));
            }
        }
        return packages;
    }
    parseContent(content) {
        const packages = {};
        const pkgReg = /\\(?:usepackage|RequirePackage)(\[[^[\]{}]*\])?{(.*?)}/gs;
        while (true) {
            const result = pkgReg.exec(content);
            if (result === null) {
                break;
            }
            const packageNames = result[2].split(',').map(packageName => packageName.trim());
            const options = (result[1] || '[]').slice(1, -1).replace(/\s*=\s*/g, '=').split(',').map(option => option.trim());
            const optionsNoTrue = options.filter(option => option.includes('=true')).map(option => option.replace('=true', ''));
            packageNames
                .map(packageName => this.toPackageObj(packageName, [...options, ...optionsNoTrue]))
                .forEach(packageObj => Object.assign(packages, packageObj));
        }
        return packages;
    }
    toPackageObj(packageName, options, node) {
        packageName = packageName.trim();
        if (packageName === '') {
            return {};
        }
        let pkgObj = {};
        if (node?.type === 'macro' && node.content === 'documentclass') {
            const clsPath = (0, pathutils_1.kpsewhich)([`${packageName}.cls`]);
            if (vscode.workspace.getConfiguration('latex-workshop').get('kpsewhich.enabled') &&
                clsPath && fs.existsSync(clsPath)) {
                pkgObj = this.parseContent(fs.readFileSync(clsPath).toString());
            }
            packageName = 'class-' + packageName;
        }
        pkgObj[packageName] = options;
        return pkgObj;
    }
}
exports.Package = Package;
//# sourceMappingURL=package.js.map