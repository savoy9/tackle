const configStore = new Map<string, unknown>();

const mockConfig = {
  get: (key: string) => configStore.get(key),
  update: vi.fn(async (key: string, value: unknown, _target?: unknown) => {
    configStore.set(key, value);
  }),
};

const globalStateMap = new Map<string, unknown>();

export const mockExtensionContext = {
  globalState: {
    get: <T>(key: string): T | undefined => globalStateMap.get(key) as T | undefined,
    update: vi.fn(async (key: string, value: unknown) => {
      globalStateMap.set(key, value);
    }),
  },
  subscriptions: [],
};

export const executeCommandCalls: unknown[][] = [];

class MockEventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];

  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };

  fire(data: T): void {
    for (const listener of this.listeners) {
      listener(data);
    }
  }

  dispose(): void {
    this.listeners = [];
  }
}

class MockTreeItem {
  label: string;
  collapsibleState: number;
  description?: string;
  contextValue?: string;
  command?: { command: string; title: string; arguments?: unknown[] };
  iconPath?: unknown;

  constructor(label: string, collapsibleState: number = 0) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

class MockThemeIcon {
  constructor(public readonly id: string) {}
}

const vscodeModule = {
  workspace: {
    getConfiguration: (_section?: string) => mockConfig,
    workspaceFolders: [{ uri: { fsPath: '/tmp/test-workspace' } }],
  },
  commands: {
    executeCommand: vi.fn(async (...args: unknown[]) => {
      executeCommandCalls.push(args);
    }),
    registerCommand: vi.fn(),
  },
  window: {
    showWarningMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    createTerminal: vi.fn((_opts?: unknown) => ({
      show: vi.fn(),
      dispose: vi.fn(),
    })),
    createTreeView: vi.fn(),
  },
  authentication: {
    getSession: vi.fn(),
  },
  extensions: {
    getExtension: vi.fn(),
  },
  Uri: {
    parse: (value: string) => ({ scheme: 'file', fsPath: value, toString: () => value }),
    file: (path: string) => ({ scheme: 'file', fsPath: path, toString: () => path }),
  },
  TerminalLocation: {
    Editor: 1,
    Panel: 2,
  },
  ConfigurationTarget: {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3,
  },
  ExtensionContext: {},
  TreeItem: MockTreeItem,
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  EventEmitter: MockEventEmitter,
  ThemeIcon: MockThemeIcon,
};

export function resetMocks() {
  configStore.clear();
  globalStateMap.clear();
  executeCommandCalls.length = 0;
  vi.clearAllMocks();
}

export default vscodeModule;
