# Electron as the application shell

Chartroom uses Electron rather than Tauri or a native Rust UI. The decisive factor is VS Code ecosystem affinity — Monaco Editor, VS Code's diff algorithm, markdown preview, and potentially language services are all Electron-native. The Review panel is essentially a task-scoped mini VS Code, and Electron makes that integration natural rather than fighting a system webview. The memory overhead (~150-300MB baseline) is acceptable given that the performance-critical path (task switching) is psmux session management, not the Electron shell.
