---
name: bump-version
description: Bump project version (patch/minor/major), create a version branch, update package.json and CHANGELOG.md. Use this skill when the user wants to start a new version, bump the version, create a release branch, or prepare a new release — even if they don't say "bump" explicitly.
---

Prepare a new version release: create a version branch, bump version in package.json, and add a CHANGELOG entry.

**Input**: `$ARGUMENTS` — bump type: `patch`, `minor`, or `major`. Defaults to `patch` if empty or omitted.

**Steps**

1. **Read current version** from `package.json` (`version` field). Parse it as `MAJOR.MINOR.PATCH`.

2. **Calculate new version** based on the bump type argument:
   - `patch` (default) → increment PATCH (e.g. 0.6.1 → 0.6.2)
   - `minor` → increment MINOR, reset PATCH to 0 (e.g. 0.6.1 → 0.7.0)
   - `major` → increment MAJOR, reset MINOR and PATCH to 0 (e.g. 0.6.1 → 1.0.0)

3. **Check git state**: ensure we are on the `main` branch and the working tree is clean (no uncommitted changes). If on a different branch or dirty, warn the user and stop.

4. **Create and switch to branch** `version/v{NEW_VERSION}` (e.g. `version/v0.6.2`). This naming convention is required by the project to avoid conflicts with release tags.

5. **Update `package.json`**: change the `version` field to the new version string.

6. **Update `CHANGELOG.md`**: insert a new section right after the `All notable changes...` line, before the previous version entry:
   ```
   ## [NEW_VERSION] - Unreleased

   ### Added

   ### Fixed
   ```
   Keep a blank line between the new section and the previous version section.

7. **Commit** the changes with message `Start new v{NEW_VERSION} development`.

8. **Report** what was done: old version, new version, branch name, and files changed.

**Important**

- Do NOT push to remote.
- The branch name MUST use `version/` prefix per project convention (see CLAUDE.md).
