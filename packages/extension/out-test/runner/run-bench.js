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

// test/runner/run-bench.ts
var path2 = __toESM(require("node:path"));

// test/runner/launch.ts
var path = __toESM(require("node:path"));
var import_test_electron = require("@vscode/test-electron");
var BASE_LAUNCH_ARGS = [
  "--disable-extensions",
  "--disable-workspace-trust",
  "--enable-proposed-api=tackle.tackle"
];
function resolveOutTestRoot(runtimeDir) {
  return runtimeDir.replace(/[\\/](?:test[\\/])?runner$/, "");
}
async function launchVsCodeSuite(opts) {
  const runtimeDir = path.dirname(process.argv[1]);
  const outTestRoot = resolveOutTestRoot(runtimeDir);
  const extensionDevelopmentPath = path.resolve(outTestRoot, "..");
  const extensionTestsPath = path.resolve(outTestRoot, opts.suiteRelativeToOutTest);
  const cleanEnv = {};
  for (const [k, v] of Object.entries(opts.env ?? {})) {
    if (v !== undefined)
      cleanEnv[k] = v;
  }
  return import_test_electron.runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: [...opts.extraLaunchArgs ?? [], ...BASE_LAUNCH_ARGS],
    extensionTestsEnv: cleanEnv
  });
}

// test/runner/run-bench.ts
async function main() {
  const exitCode = await launchVsCodeSuite({
    suiteRelativeToOutTest: path2.join("suite", "index.js"),
    env: {
      TACKLE_SUITE_DIR: path2.resolve(path2.dirname(process.argv[1]), "..", "suite")
    }
  });
  process.exit(exitCode);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
