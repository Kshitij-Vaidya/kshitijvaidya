"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeDviFile = void 0;
const promises_1 = require("node:fs/promises");
const dvi_decode_1 = require("@matjp/dvi-decode");
async function decodeDviFile(dviFileName, fontMap, dpi, mag, debugMode, log) {
    return new Promise(async (resolve, reject) => {
        try {
            const dviData = await (0, promises_1.readFile)(dviFileName);
            try {
                const doc = await (0, dvi_decode_1.dviDecode)(dviData, dpi, mag * 10, fontMap, debugMode, log);
                resolve(doc);
            }
            catch (err) {
                reject(err);
            }
        }
        catch (err) {
            reject(err);
        }
    });
}
exports.decodeDviFile = decodeDviFile;
//# sourceMappingURL=decodeDviFile.js.map