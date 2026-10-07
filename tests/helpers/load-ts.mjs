import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
export function loadTs(filename) {
  const resolved = path.resolve(filename);
  if (cache.has(resolved)) return cache.get(resolved).exports;
  const module = { exports: {} }; cache.set(resolved, module);
  const output = ts.transpileModule(readFileSync(resolved, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const localRequire = specifier => {
    if (specifier.startsWith('.')) return loadTs(path.resolve(path.dirname(resolved), specifier.endsWith('.ts') ? specifier : `${specifier}.ts`));
    throw new Error(`Unexpected test import: ${specifier}`);
  };
  vm.runInNewContext(`(function(exports, require, module) { ${output}\n})`, { console })(module.exports, localRequire, module);
  return module.exports;
}
