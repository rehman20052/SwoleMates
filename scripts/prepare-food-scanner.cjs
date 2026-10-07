const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public', 'scanner');
fs.mkdirSync(output, { recursive: true });
function copy(source, name) { fs.copyFileSync(path.join(root, 'node_modules', source), path.join(output, name)); }
copy('zxing-wasm/dist/reader/zxing_reader.wasm', 'zxing_reader.wasm');
copy('zxing-wasm/LICENSE', 'zxing-LICENSE.txt');
console.log('Local barcode reader assets prepared.');
