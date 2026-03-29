## ADDED Requirements

### Requirement: Cross-platform folder opener

The system SHALL provide an `openFolder(folderPath)` utility that opens a folder in the system file manager. The function SHALL use `open` on macOS, `xdg-open` on Linux, and `start` on Windows. The function SHALL return a boolean indicating success and SHALL NOT throw on failure.

#### Scenario: Open folder on macOS
- **WHEN** `openFolder("/path/to/folder")` is called on macOS (`process.platform === 'darwin'`)
- **THEN** the system SHALL execute `open "/path/to/folder"` and return `true` on success

#### Scenario: Open folder on Linux
- **WHEN** `openFolder("/path/to/folder")` is called on Linux (`process.platform === 'linux'`)
- **THEN** the system SHALL execute `xdg-open "/path/to/folder"` and return `true` on success

#### Scenario: Open folder on Windows
- **WHEN** `openFolder("C:\\path\\to\\folder")` is called on Windows (`process.platform === 'win32'`)
- **THEN** the system SHALL execute `start "" "C:\\path\\to\\folder"` and return `true` on success

#### Scenario: Graceful failure
- **WHEN** the open command fails (e.g. `xdg-open` not installed)
- **THEN** the function SHALL return `false` without throwing an error
