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

// test/bench/latency.test.ts
var assert = __toESM(require("node:assert"));
var vscode2 = __toESM(require("vscode"));

// ../../../../../packages/shared/src/db/database.ts
function openDatabase(dbPath) {
  try {
    const { Database: BunDB } = require("bun:sqlite");
    const db2 = new BunDB(dbPath);
    db2.run("PRAGMA journal_mode = WAL");
    db2.run("PRAGMA foreign_keys = ON");
    return {
      exec: (sql) => db2.run(sql),
      prepare: (sql) => {
        const stmt = db2.prepare(sql);
        return {
          all: (...params) => stmt.all(...params),
          get: (...params) => stmt.get(...params) ?? undefined,
          run: (...params) => {
            const result = stmt.run(...params);
            return { changes: result?.changes ?? 0, lastInsertRowid: result?.lastInsertRowid ?? 0 };
          }
        };
      },
      close: () => db2.close()
    };
  } catch {}
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db2 = new DatabaseSync(dbPath);
    db2.exec("PRAGMA journal_mode = WAL");
    db2.exec("PRAGMA foreign_keys = ON");
    return {
      exec: (sql) => db2.exec(sql),
      prepare: (sql) => {
        const stmt = db2.prepare(sql);
        return {
          all: (...params) => stmt.all(...params),
          get: (...params) => stmt.get(...params) ?? undefined,
          run: (...params) => {
            const result = stmt.run(...params);
            return { changes: result?.changes ?? 0, lastInsertRowid: result?.lastInsertRowid ?? 0 };
          }
        };
      },
      close: () => db2.close()
    };
  } catch {}
  const BetterSqlite3 = require("better-sqlite3");
  const db = new BetterSqlite3(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return {
    exec: (sql) => db.exec(sql),
    prepare: (sql) => {
      const stmt = db.prepare(sql);
      return {
        all: (...params) => stmt.all(...params),
        get: (...params) => stmt.get(...params),
        run: (...params) => stmt.run(...params)
      };
    },
    close: () => db.close()
  };
}
var SCHEMA = `
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT NOT NULL,
    external_system TEXT NOT NULL CHECK(external_system IN ('github', 'ado')),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open',
    assignee TEXT,
    parent_external_id TEXT,
    worktree_path TEXT,
    worktree_branch TEXT,
    worktree_base_branch TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_external
    ON tasks(external_system, external_id);

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER REFERENCES tasks(id),
    phase_id INTEGER REFERENCES phases(id),
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'implement' CHECK(kind IN ('plan','implement','review','debug','test','pilot','shell')),
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'stopped')),
    psmux_name TEXT NOT NULL,
    tab_label TEXT NOT NULL DEFAULT '',
    agent TEXT,
    worktree_path TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    claude_session_id TEXT,
    agent_state TEXT NOT NULL DEFAULT 'idle' CHECK(agent_state IN ('idle','working','waiting')),
    prior_claude_session_ids TEXT,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    deleted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    source_path TEXT NOT NULL,
    extracted_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_plans_task
    ON plans(task_id);

  CREATE TABLE IF NOT EXISTS phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES plans(id),
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'done', 'failed')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS layout_states (
    task_id TEXT PRIMARY KEY,
    editor_layout TEXT NOT NULL DEFAULT '{}',
    terminal_placements TEXT NOT NULL DEFAULT '[]',
    review_files TEXT NOT NULL DEFAULT '[]',
    focused_session_id TEXT,
    focused_group_index INTEGER
  );

  CREATE TABLE IF NOT EXISTS summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES sessions(id),
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;
function migrate(db) {
  function columnExists(table, column) {
    const rows = db.prepare(`PRAGMA table_info('${table}')`).all();
    return rows.some((r) => r.name === column);
  }
  function tableExists(table) {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
    return !!row;
  }
  if (tableExists("sessions")) {
    if (!columnExists("sessions", "agent_state")) {
      db.exec("ALTER TABLE sessions ADD COLUMN agent_state TEXT NOT NULL DEFAULT 'idle'");
    }
    if (!columnExists("sessions", "prior_claude_session_ids")) {
      db.exec("ALTER TABLE sessions ADD COLUMN prior_claude_session_ids TEXT");
    }
    if (!columnExists("sessions", "deleted_at")) {
      db.exec("ALTER TABLE sessions ADD COLUMN deleted_at TEXT");
    }
  }
  if (tableExists("tasks")) {
    if (!columnExists("tasks", "parent_external_id")) {
      db.exec("ALTER TABLE tasks ADD COLUMN parent_external_id TEXT");
    }
    if (!columnExists("tasks", "worktree_path")) {
      db.exec("ALTER TABLE tasks ADD COLUMN worktree_path TEXT");
    }
    if (!columnExists("tasks", "worktree_branch")) {
      db.exec("ALTER TABLE tasks ADD COLUMN worktree_branch TEXT");
    }
    if (!columnExists("tasks", "worktree_base_branch")) {
      db.exec("ALTER TABLE tasks ADD COLUMN worktree_base_branch TEXT");
    }
  }
}
function createDatabase(dbPath) {
  const db = openDatabase(dbPath);
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
// ../../../../../packages/shared/src/db/sqlite-repositories.ts
var UPSERT_TASK_SQL = `INSERT INTO tasks (external_id, external_system, title, description, status, assignee, parent_external_id, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(external_system, external_id) DO UPDATE SET
       title = excluded.title,
       description = excluded.description,
       status = excluded.status,
       assignee = excluded.assignee,
       parent_external_id = excluded.parent_external_id,
       synced_at = datetime('now')`;

class SqliteTaskRepository {
  db;
  constructor(db) {
    this.db = db;
  }
  list() {
    return Promise.resolve(this.db.prepare("SELECT * FROM tasks ORDER BY id").all());
  }
  get(id) {
    return Promise.resolve(this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id));
  }
  upsert(task) {
    this.db.prepare(UPSERT_TASK_SQL).run(task.external_id, task.external_system, task.title, task.description, task.status, task.assignee, task.parent_external_id ?? null);
    return Promise.resolve();
  }
  upsertBatch(tasks) {
    this.db.exec("BEGIN");
    try {
      const stmt = this.db.prepare(UPSERT_TASK_SQL);
      for (const task of tasks) {
        stmt.run(task.external_id, task.external_system, task.title, task.description, task.status, task.assignee, task.parent_external_id ?? null);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return Promise.resolve();
  }
  setWorktree(id, fields) {
    this.db.prepare("UPDATE tasks SET worktree_path = ?, worktree_branch = ?, worktree_base_branch = ? WHERE id = ?").run(fields.worktree_path, fields.worktree_branch, fields.worktree_base_branch, id);
    return Promise.resolve();
  }
}
// ../../../../../packages/shared/src/psmux/psmux-bridge.ts
var import_child_process = require("child_process");
function detectBinary() {
  const which = (cmd) => {
    import_child_process.execSync(process.platform === "win32" ? `where ${cmd}` : `which ${cmd}`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"]
    });
  };
  try {
    which("psmux");
    return "psmux";
  } catch {}
  try {
    which("tmux");
    return "tmux";
  } catch {}
  return "";
}

class PsmuxBridge {
  binary;
  constructor(binary) {
    this.binary = binary ?? detectBinary();
  }
  exec(cmd) {
    try {
      return import_child_process.execSync(cmd, { encoding: "utf-8", timeout: 5000 }).trim();
    } catch (e) {
      if (e.stdout)
        return e.stdout.toString().trim();
      throw e;
    }
  }
  static hasExecutable() {
    return detectBinary() !== "";
  }
  static generateSessionName(source, taskId, kind, n) {
    const prefix = process.env.TACKLE_TEST_PSMUX_PREFIX ?? "tackle-";
    return `${prefix}${source}-${taskId}-${kind}${n}`;
  }
  static generateTabLabel(taskId, slug, kind, n, label) {
    const base = `${taskId}-${slug}|${kind}${n}`;
    return label ? `${base}-${label}` : base;
  }
  assertBinary() {
    if (!this.binary) {
      throw new Error("No terminal multiplexer found. Install psmux or tmux and reactivate Tackle.");
    }
  }
  createSession(name) {
    this.assertBinary();
    this.exec(`${this.binary} new-session -d -s "${name}"`);
  }
  killSession(name) {
    this.assertBinary();
    this.exec(`${this.binary} kill-session -t "${name}"`);
  }
  hasSession(name) {
    if (!this.binary)
      return false;
    try {
      this.exec(`${this.binary} has-session -t "${name}"`);
      return true;
    } catch {
      return false;
    }
  }
  listSessions() {
    if (!this.binary)
      return [];
    const output = this.exec(`${this.binary} list-sessions`);
    if (!output)
      return [];
    return output.split(`
`).filter(Boolean).map((line) => {
      const colonIdx = line.indexOf(":");
      return colonIdx >= 0 ? line.substring(0, colonIdx) : line;
    });
  }
  sendKeys(sessionName, keys, target) {
    this.assertBinary();
    const t = target ? `"${sessionName}:${target}"` : `"${sessionName}"`;
    this.exec(`${this.binary} send-keys -t ${t} "${keys}" Enter`);
  }
}
// src/bench/latency-bench.ts
var vscode = __toESM(require("vscode"));
var import_node_child_process = require("node:child_process");
async function runLatencyBenchmark(psmux, iterations = 10) {
  if (!psmux.binary)
    throw new Error("No psmux/tmux binary found.");
  const sessionName = `tackle-bench-${Date.now()}`;
  psmux.createSession(sessionName);
  await sleep(300);
  const samples = [];
  try {
    for (let i = 0;i < iterations; i++) {
      const lineSentinel = `BD${i}L${randomId()}`;
      const tLine = performance.now();
      import_node_child_process.execSync(`${psmux.binary} send-keys -t "${sessionName}" "${lineSentinel}" Enter`, { timeout: 5000 });
      samples.push({
        iteration: i,
        method: "psmux-direct-line",
        latencyMs: await waitForSentinelInPane(psmux, sessionName, lineSentinel, tLine)
      });
      import_node_child_process.execSync(`${psmux.binary} send-keys -t "${sessionName}" "clear" Enter`, { timeout: 5000 });
      await sleep(30);
      const keySentinel = `bd${i}${randomId().toLowerCase()}`;
      for (let c = 0;c < keySentinel.length; c++) {
        const prefix = keySentinel.slice(0, c + 1);
        const t = performance.now();
        import_node_child_process.execSync(`${psmux.binary} send-keys -l -t "${sessionName}" "${keySentinel[c]}"`, { timeout: 5000 });
        samples.push({
          iteration: i,
          method: "psmux-direct-key",
          latencyMs: await waitForSentinelInPane(psmux, sessionName, prefix, t)
        });
      }
      import_node_child_process.execSync(`${psmux.binary} send-keys -t "${sessionName}" C-u`, { timeout: 5000 });
      await sleep(30);
    }
    await measureTerminalRoundTrip({
      terminalOptions: {
        name: `bench-tackle-${sessionName}`,
        location: vscode.TerminalLocation.Editor,
        shellPath: psmux.binary,
        shellArgs: ["attach", "-t", sessionName]
      },
      methods: {
        line: "tackle-terminal-line",
        key: "tackle-terminal-key",
        burstFirst: "tackle-terminal-burst-first",
        burstLast: "tackle-terminal-burst-last",
        burstGap: "tackle-terminal-burst-gap"
      },
      iterations,
      samples
    });
    await measureTerminalRoundTrip({
      terminalOptions: {
        name: `bench-plain-${sessionName}`,
        location: vscode.TerminalLocation.Editor
      },
      methods: {
        line: "plain-shell-line",
        key: "plain-shell-key",
        burstFirst: "plain-shell-burst-first",
        burstLast: "plain-shell-burst-last",
        burstGap: "plain-shell-burst-gap"
      },
      iterations,
      samples
    });
  } finally {
    try {
      psmux.killSession(sessionName);
    } catch {}
  }
  return { samples, summary: summarize(samples) };
}
var BURST_LENGTH = 20;
async function measureTerminalRoundTrip(opts) {
  const terminal = vscode.window.createTerminal(opts.terminalOptions);
  terminal.show();
  await sleep(2000);
  const dataBuf = new DataBuffer(terminal);
  try {
    for (let i = 0;i < opts.iterations; i++) {
      const lineSentinel = `BT${i}L${randomId()}`;
      await dataBuf.drainAndReset();
      const tLine = performance.now();
      terminal.sendText(lineSentinel, true);
      opts.samples.push({
        iteration: i,
        method: opts.methods.line,
        latencyMs: await dataBuf.waitFor(lineSentinel, tLine)
      });
      resetInputLine(terminal);
      const keySentinel = makeUniqueKeySentinel(i);
      await dataBuf.drainAndReset();
      for (let c = 0;c < keySentinel.length; c++) {
        const ch = keySentinel[c];
        const t = performance.now();
        terminal.sendText(ch, false);
        opts.samples.push({
          iteration: i,
          method: opts.methods.key,
          latencyMs: await dataBuf.waitForChar(ch, t)
        });
      }
      resetInputLine(terminal);
      const burstSentinel = makeBurstSentinel(i, BURST_LENGTH);
      await dataBuf.drainAndReset();
      dataBuf.startBurstRecording();
      const tBurst = performance.now();
      for (const ch of burstSentinel) {
        terminal.sendText(ch, false);
      }
      const burst = await dataBuf.waitForBurst(burstSentinel, tBurst);
      opts.samples.push({ iteration: i, method: opts.methods.burstFirst, latencyMs: burst.firstCharMs });
      opts.samples.push({ iteration: i, method: opts.methods.burstLast, latencyMs: burst.lastCharMs });
      opts.samples.push({ iteration: i, method: opts.methods.burstGap, latencyMs: burst.maxGapMs });
      resetInputLine(terminal);
    }
  } finally {
    dataBuf.dispose();
    terminal.dispose();
    await sleep(500);
  }
}
function makeBurstSentinel(iter, length) {
  const pool = "abcdefghijklmnopqrstuvwxyz";
  let s = `z${iter}`;
  while (s.length < length)
    s += pool[Math.floor(Math.random() * pool.length)];
  return s.slice(0, length);
}
function makeUniqueKeySentinel(iter) {
  const pool = "abcdefghijklmnopqrstuvwxyz";
  const chars = pool.split("").sort(() => Math.random() - 0.5);
  return chars.slice(0, 8).join("") + String(iter);
}
function resetInputLine(terminal) {
  terminal.sendText("\x03", false);
}

class DataBuffer {
  terminal;
  disposable;
  buffer = "";
  pendingChar = null;
  lastDataAtMs = 0;
  burstRecording = false;
  burstArrivals = [];
  constructor(terminal) {
    this.terminal = terminal;
    this.disposable = vscode.window.onDidWriteTerminalData((e) => {
      if (e.terminal !== this.terminal)
        return;
      const nowMs = performance.now();
      this.lastDataAtMs = nowMs;
      this.buffer += e.data;
      const visible = stripEscapes(e.data);
      if (this.burstRecording) {
        for (const ch of visible)
          this.burstArrivals.push({ ch, atMs: nowMs });
      }
      if (this.pendingChar) {
        const { ch, startedAt, resolve } = this.pendingChar;
        if (visible.includes(ch)) {
          this.pendingChar = null;
          resolve(nowMs - startedAt);
        }
      }
    });
  }
  reset() {
    this.buffer = "";
    this.pendingChar = null;
    this.burstRecording = false;
    this.burstArrivals = [];
  }
  async drainAndReset(quietMs = 200, maxWaitMs = 3000) {
    const deadline = performance.now() + maxWaitMs;
    while (performance.now() < deadline) {
      const since = performance.now() - this.lastDataAtMs;
      if (since >= quietMs)
        break;
      await sleep(Math.min(quietMs - since, 50));
    }
    this.reset();
  }
  startBurstRecording() {
    this.burstRecording = true;
    this.burstArrivals = [];
  }
  async waitFor(sentinel, startedAt, timeoutMs = 30000) {
    const deadline = startedAt + timeoutMs;
    while (performance.now() < deadline) {
      if (this.buffer.includes(sentinel))
        return performance.now() - startedAt;
      await sleep(2);
    }
    throw new Error(`Timed out waiting for sentinel ${sentinel} after ${timeoutMs}ms (buffer tail: ${JSON.stringify(this.buffer.slice(-80))})`);
  }
  waitForChar(ch, startedAt, timeoutMs = 1e4) {
    return new Promise((resolve, reject) => {
      this.pendingChar = { ch, startedAt, resolve };
      const timer = setTimeout(() => {
        if (this.pendingChar?.ch === ch) {
          this.pendingChar = null;
          reject(new Error(`Timed out waiting for char '${ch}' after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      const orig = this.pendingChar.resolve;
      this.pendingChar.resolve = (t) => {
        clearTimeout(timer);
        orig(t);
      };
    });
  }
  async waitForBurst(sentinel, startedAt, timeoutMs = 30000) {
    const deadline = startedAt + timeoutMs;
    while (performance.now() < deadline) {
      const matched = matchSentinelAgainstArrivals(sentinel, this.burstArrivals);
      if (matched) {
        this.burstRecording = false;
        const firstCharMs = matched[0].atMs - startedAt;
        const lastCharMs = matched[matched.length - 1].atMs - startedAt;
        let maxGapMs = 0;
        for (let i = 1;i < matched.length; i++) {
          const gap = matched[i].atMs - matched[i - 1].atMs;
          if (gap > maxGapMs)
            maxGapMs = gap;
        }
        return { firstCharMs, lastCharMs, maxGapMs };
      }
      await sleep(2);
    }
    this.burstRecording = false;
    throw new Error(`Timed out waiting for burst ${JSON.stringify(sentinel)} after ${timeoutMs}ms ` + `(arrivals: ${this.burstArrivals.map((a) => a.ch).join("")})`);
  }
  dispose() {
    this.disposable.dispose();
  }
}
function stripEscapes(s) {
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}
function matchSentinelAgainstArrivals(sentinel, arrivals) {
  const matched = [];
  let si = 0;
  for (const a of arrivals) {
    if (si < sentinel.length && a.ch === sentinel[si]) {
      matched.push(a);
      si++;
    }
    if (si === sentinel.length)
      return matched;
  }
  return null;
}
async function waitForSentinelInPane(psmux, sessionName, sentinel, startedAt, timeoutMs = 60000) {
  while (performance.now() - startedAt < timeoutMs) {
    try {
      const output = import_node_child_process.execSync(`${psmux.binary} capture-pane -p -t "${sessionName}"`, {
        encoding: "utf-8",
        timeout: 5000
      });
      if (output.includes(sentinel))
        return performance.now() - startedAt;
    } catch {}
    await sleep(1);
  }
  throw new Error(`Timed out waiting for sentinel ${sentinel} in pane after ${timeoutMs}ms`);
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function randomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}
function summarize(samples) {
  const methods = Array.from(new Set(samples.map((s) => s.method)));
  return methods.map((method) => {
    const ms = samples.filter((s) => s.method === method).map((s) => s.latencyMs).sort((a, b) => a - b);
    return {
      method,
      count: ms.length,
      p50: pct(ms, 0.5),
      p95: pct(ms, 0.95),
      p99: pct(ms, 0.99),
      max: ms[ms.length - 1],
      mean: ms.reduce((a, b) => a + b, 0) / ms.length
    };
  });
}
function pct(sorted, p) {
  if (sorted.length === 0)
    return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}
// test/bench/latency.test.ts
suite("Terminal latency", () => {
  test("Tackle terminal input latency is within threshold", async function() {
    this.timeout(300000);
    const psmux = new PsmuxBridge;
    if (!psmux.binary) {
      console.warn("No psmux/tmux binary available; skipping benchmark.");
      this.skip();
      return;
    }
    const result = await runLatencyBenchmark(psmux, 8);
    const byMethod = new Map;
    for (const s of result.summary)
      byMethod.set(s.method, s);
    const pick = (m) => {
      const s = byMethod.get(m);
      assert.ok(s, `missing summary for ${m}`);
      return s;
    };
    const directLine = pick("psmux-direct-line");
    const directKey = pick("psmux-direct-key");
    const plainLine = pick("plain-shell-line");
    const plainKey = pick("plain-shell-key");
    const plainBurstFirst = pick("plain-shell-burst-first");
    const plainBurstLast = pick("plain-shell-burst-last");
    const plainBurstGap = pick("plain-shell-burst-gap");
    const tackleLine = pick("tackle-terminal-line");
    const tackleKey = pick("tackle-terminal-key");
    const tackleBurstFirst = pick("tackle-terminal-burst-first");
    const tackleBurstLast = pick("tackle-terminal-burst-last");
    const tackleBurstGap = pick("tackle-terminal-burst-gap");
    for (const s of result.summary) {
      console.log(`[bench] ${s.method.padEnd(28)} ${JSON.stringify(s)}`);
    }
    const keyOverheadMs = tackleKey.mean - plainKey.mean;
    const lineOverheadMs = tackleLine.mean - plainLine.mean;
    const burstLastOverheadMs = tackleBurstLast.mean - plainBurstLast.mean;
    const burstGapOverheadMs = tackleBurstGap.mean - plainBurstGap.mean;
    console.log(`[bench] key         overhead vs plain shell: +${keyOverheadMs.toFixed(0)}ms mean`);
    console.log(`[bench] line        overhead vs plain shell: +${lineOverheadMs.toFixed(0)}ms mean`);
    console.log(`[bench] burst-last  overhead vs plain shell: +${burstLastOverheadMs.toFixed(0)}ms mean`);
    console.log(`[bench] burst-gap   overhead vs plain shell: +${burstGapOverheadMs.toFixed(0)}ms mean`);
    const TACKLE_LINE_P50_MAX_MS = 800;
    const TACKLE_LINE_P95_MAX_MS = 1200;
    const TACKLE_KEY_P50_MAX_MS = 300;
    const TACKLE_KEY_P95_MAX_MS = 600;
    const TACKLE_BURST_GAP_P50_MAX_MS = 200;
    const TACKLE_BURST_GAP_P95_MAX_MS = 500;
    const TACKLE_BURST_LAST_P50_MAX_MS = 800;
    const KEY_OVERHEAD_MS_MAX = 250;
    const LINE_OVERHEAD_MS_MAX = 500;
    assert.ok(tackleLine.p50 <= TACKLE_LINE_P50_MAX_MS, `tackle-line p50=${tackleLine.p50.toFixed(0)}ms exceeds ${TACKLE_LINE_P50_MAX_MS}ms`);
    assert.ok(tackleLine.p95 <= TACKLE_LINE_P95_MAX_MS, `tackle-line p95=${tackleLine.p95.toFixed(0)}ms exceeds ${TACKLE_LINE_P95_MAX_MS}ms`);
    assert.ok(tackleKey.p50 <= TACKLE_KEY_P50_MAX_MS, `tackle-key p50=${tackleKey.p50.toFixed(0)}ms exceeds ${TACKLE_KEY_P50_MAX_MS}ms`);
    assert.ok(tackleKey.p95 <= TACKLE_KEY_P95_MAX_MS, `tackle-key p95=${tackleKey.p95.toFixed(0)}ms exceeds ${TACKLE_KEY_P95_MAX_MS}ms`);
    assert.ok(tackleBurstGap.p50 <= TACKLE_BURST_GAP_P50_MAX_MS, `tackle-burst-gap p50=${tackleBurstGap.p50.toFixed(0)}ms exceeds ${TACKLE_BURST_GAP_P50_MAX_MS}ms`);
    assert.ok(tackleBurstGap.p95 <= TACKLE_BURST_GAP_P95_MAX_MS, `tackle-burst-gap p95=${tackleBurstGap.p95.toFixed(0)}ms exceeds ${TACKLE_BURST_GAP_P95_MAX_MS}ms`);
    assert.ok(tackleBurstLast.p50 <= TACKLE_BURST_LAST_P50_MAX_MS, `tackle-burst-last p50=${tackleBurstLast.p50.toFixed(0)}ms exceeds ${TACKLE_BURST_LAST_P50_MAX_MS}ms`);
    assert.ok(keyOverheadMs <= KEY_OVERHEAD_MS_MAX, `tackle key adds +${keyOverheadMs.toFixed(0)}ms vs plain shell (max ${KEY_OVERHEAD_MS_MAX}ms)`);
    assert.ok(lineOverheadMs <= LINE_OVERHEAD_MS_MAX, `tackle line adds +${lineOverheadMs.toFixed(0)}ms vs plain shell (max ${LINE_OVERHEAD_MS_MAX}ms)`);
  });
  test("VS Code is reachable", () => {
    assert.ok(vscode2.window, "vscode.window missing");
  });
});
