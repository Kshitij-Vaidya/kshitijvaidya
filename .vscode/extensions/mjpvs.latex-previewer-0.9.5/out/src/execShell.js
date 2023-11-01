"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.execShell = void 0;
const node_child_process_1 = __importDefault(require("node:child_process"));
const execShell = (cmd) => new Promise((resolve, reject) => {
    node_child_process_1.default.exec(cmd, (err, out) => {
        if (err) {
            return reject(err);
        }
        return resolve(out);
    });
});
exports.execShell = execShell;
//# sourceMappingURL=execShell.js.map