var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// test/suite/index.ts
var exports_suite = {};
__export(exports_suite, {
  run: () => run
});
module.exports = __toCommonJS(exports_suite);
var path = __toESM(require("node:path"));
var import_mocha = __toESM(require("mocha"));
var import_glob = require("glob");
async function run() {
  const mocha = new import_mocha.default({
    ui: "tdd",
    color: true,
    timeout: 120000,
    reporter: "spec"
  });
  const suiteDir = process.env.TACKLE_SUITE_DIR ?? path.dirname(require.resolve("./index.js"));
  const testsRoot = path.resolve(suiteDir, "..");
  const files = await import_glob.glob("bench/**/*.test.js", { cwd: testsRoot });
  for (const f of files)
    mocha.addFile(path.resolve(testsRoot, f));
  await new Promise((resolve2, reject) => {
    mocha.run((failures) => {
      if (failures > 0)
        reject(new Error(`${failures} test(s) failed`));
      else
        resolve2();
    });
  });
}
