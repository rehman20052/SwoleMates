const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public', 'scanner');
fs.mkdirSync(output, { recursive: true });
function copy(source, name) { fs.copyFileSync(path.join(root, 'node_modules', source), path.join(output, name)); }
copy('tesseract.js/dist/worker.min.js', 'worker.min.js');
copy('tesseract.js/dist/worker.min.js.LICENSE.txt', 'worker.min.js.LICENSE.txt');
copy('tesseract.js-core/LICENSE', 'core-LICENSE.txt');
for (const name of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) copy(`tesseract.js-core/${name}`, name);
copy('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz');
copy('zxing-wasm/dist/reader/zxing_reader.wasm', 'zxing_reader.wasm');
copy('zxing-wasm/LICENSE', 'zxing-LICENSE.txt');
console.log('Local food-label reader assets prepared.');
