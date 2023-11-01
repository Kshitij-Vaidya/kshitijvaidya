"use strict";
/*
MIT License

Copyright (c) 2018 Thomas Durieux

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSyncTex = void 0;
/*
  December 2022 Matthew J. Penwill - Converted to Typescript and simplified to output only flattened block data.
*/
const node_path_1 = __importDefault(require("node:path"));
function parseSyncTex(syncBody, fileName, dpi, mag) {
    var unit = 65781.76 * (72 / dpi) * (100 / mag);
    var currentPage;
    var fileNumber;
    var syncObject = {
        offset: {
            x: 0,
            y: 0
        },
        blocks: []
    };
    if (syncBody === null) {
        return syncObject;
    }
    var lineArray = syncBody.split("\n");
    const inputPattern = /Input:([0-9]+):(.+)/;
    const offsetPattern = /(X|Y) Offset:([0-9]+)/;
    const openPagePattern = /\{([0-9]+)$/;
    const closePagePattern = /\}([0-9]+)$/;
    //const verticalBlockPattern = /\[([0-9]+),([0-9]+):(-?[0-9]+),(-?[0-9]+):(-?[0-9]+),(-?[0-9]+),(-?[0-9]+)/;
    const horizontalBlockPattern = /\(([0-9]+),([0-9]+):(-?[0-9]+),(-?[0-9]+):(-?[0-9]+),(-?[0-9]+),(-?[0-9]+)/;
    const elementBlockPattern = /(.)([0-9]+),([0-9]+):(-?[0-9]+),(-?[0-9]+)(:?-?([0-9]+))?/;
    var match;
    for (var i = 1; i < lineArray.length; i++) {
        var line = lineArray[i];
        //input files
        match = line.match(inputPattern);
        if (match) {
            if (node_path_1.default.normalize(match[2]) === node_path_1.default.normalize(fileName)) {
                fileNumber = parseInt(match[1]);
            }
            continue;
        }
        //offset
        match = line.match(offsetPattern);
        if (match) {
            const coordType = match[1].toLowerCase();
            const coordValue = Math.round(parseInt(match[2]) / unit);
            switch (coordType) {
                case 'x': {
                    syncObject.offset.x = coordValue;
                    break;
                }
                case 'y': {
                    syncObject.offset.y = coordValue;
                    break;
                }
            }
            continue;
        }
        //new page
        match = line.match(openPagePattern);
        if (match) {
            currentPage = parseInt(match[1]);
            continue;
        }
        // close page
        match = line.match(closePagePattern);
        if (match) {
            currentPage = undefined;
            continue;
        }
        // new vertical block
        /*
        match = line.match(verticalBlockPattern);
        if (match && currentPage) {
          if (fileNumber === parseInt(match[1])) {
            const lineNumber = parseInt(match[2]);
            const block: SyncTexBlock = {
              type: 'v',
              page: currentPage,
              lineNumber: lineNumber,
              left: Math.round(parseInt(match[3]) / unit),
              bottom: Math.round(parseInt(match[4]) / unit),
              width: Math.round(parseInt(match[5]) / unit),
              height: Math.round(parseInt(match[6]) / unit),
              depth: Math.round(parseInt(match[7]) / unit)
            };
            if (lineNumber && block.width !== 0 && block.height !== 0) {
              syncObject.blocks.push(block);
            }
          }
          continue;
        }
        */
        // new horizontal block
        match = line.match(horizontalBlockPattern);
        if (match && currentPage) {
            if (fileNumber === parseInt(match[1])) {
                const lineNumber = parseInt(match[2]);
                const block = {
                    type: 'h',
                    page: currentPage,
                    lineNumber: lineNumber,
                    left: Math.round(parseInt(match[3]) / unit),
                    bottom: Math.round(parseInt(match[4]) / unit),
                    width: Math.round(parseInt(match[5]) / unit),
                    height: Math.round(parseInt(match[6]) / unit),
                    depth: Math.round(parseInt(match[7]) / unit)
                };
                if (lineNumber && block.width !== 0 && block.height !== 0) {
                    syncObject.blocks.push(block);
                }
            }
            continue;
        }
        // new element
        match = line.match(elementBlockPattern);
        if (match && currentPage) {
            if (fileNumber === parseInt(match[2])) {
                var type = match[1];
                if (type === 'g') {
                    const lineNumber = parseInt(match[3]);
                    const element = {
                        type: 'g',
                        page: currentPage,
                        lineNumber: lineNumber,
                        left: Math.round(parseInt(match[4]) / unit),
                        bottom: Math.round(parseInt(match[5]) / unit),
                        width: (match[7]) ? Math.round(parseInt(match[7]) / unit) / unit : 0,
                        height: (match[6]) ? Math.round(parseInt(match[6]) / unit) : 0,
                        depth: 0
                    };
                    if (lineNumber) {
                        syncObject.blocks.push(element);
                    }
                }
            }
            continue;
        }
    }
    return syncObject;
}
exports.parseSyncTex = parseSyncTex;
;
//# sourceMappingURL=synctexParser.js.map