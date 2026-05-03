# Troubleshooting Guide

**Version**: 1.4.0
**Last Updated**: 2026-05-03

This guide helps you resolve common issues with the C4X extension.

---

## Preview Panel Issues

### Issue: The preview panel is blank, empty, or shows a loading indicator that never disappears

**Cause**: The preview panel may fail to render if there are syntax errors in the diagram source or if the extension host is not running correctly.

**Solution**:

1. Confirm the extension is running: open a `.c4x` file or a Markdown file with a `c4x` fenced block.
2. Ensure you have built the extension: `make build`.
3. If you see parse errors:
    - Check `%%{ c4: ... }%%` view directive and `graph TB|BT|LR|RL`
    - Verify element syntax `ID[Label<br/>Type]` and relationship syntax `From -->|Label| To`

### Issue: The preview panel shows an error message like "Cannot read properties of undefined."

**Cause**: This can happen if a relationship references an element `ID` that does not exist.

**Solution**:

1. **Check Relationship IDs**: For every relationship (`FromID --> ToID`), ensure that both `FromID` and `ToID` match the `ElementID` of an element defined in your diagram.
2. **Verify Element IDs**: Remember that `ElementID` is case-sensitive.

### Issue: The preview does not update after I save the file

**Cause**: The file watcher might not be running correctly, or there could be a deeper issue with the extension host.

**Solution**:

1. **Run the Command Manually**: Open the Command Palette (`Ctrl+Shift+P`) and run **C4X: Open Preview** again.
2. **Reload the Window**: Use the **Developer: Reload Window** command from the Command Palette to restart the extension host.
3. **Restart VS Code**: A full restart can sometimes resolve persistent issues.

---

## Conflicting Extensions

### Issue: Markdown preview shows "!No PlantUML server" error

**Cause**: The **PlantUML (jebbs.plantuml)** extension is installed and trying to render `plantuml` code blocks inside Markdown files, but conflicts with C4X or lacks a configured server.

**Solution**:

1. **Option A (Recommended)**: Disable or uninstall the `jebbs.plantuml` extension for this workspace if you only need C4X rendering.
2. **Option B**: Configure the PlantUML extension to use the public server in your `.vscode/settings.json`:
    ```json
    "plantuml.server": "https://www.plantuml.com/plantuml"
    ```

---

## Markdown Integration Issues

### Issue: The C4X diagram is not rendering in the Markdown preview; it just shows the code block

**Cause**: Markdown fenced-block rendering requires workspace trust and the correct code fence syntax.

**Solution**:

1. Verify your code fences use exactly ` ```c4x ` (no extra spaces or characters).
2. Ensure the workspace is trusted (VS Code may block extension scripts in untrusted workspaces).
3. Try reloading the window: **Developer: Reload Window** from the Command Palette.

---

## Performance Issues

### Issue: The preview is slow to update for very large diagrams

**Cause**: While C4X is fast, extremely large diagrams (hundreds of elements) can take longer to parse and lay out.

**Solution**:

1. **Check Diagram Size**: For diagrams with over 200 elements, expect a minor delay (over 500ms).
2. **Break Down Diagrams**: Very large diagrams can be difficult for anyone to read. Consider breaking them down into smaller, more focused diagrams (e.g., separate C2 diagrams for different parts of a system).
3. **File an Issue**: If you believe performance is slow for a reasonably sized diagram, please [file an issue on GitHub](https://github.com/jpantsjoha/c4x-vscode-extension/issues) with an example file.

---

## Installation / Build Issues

### Issue: `pnpm` not found or install fails with npm cache permissions

**Solution**:

```bash
brew install pnpm || true
sudo chown -R "$USER:staff" ~/.npm
pnpm install
make build
```

### Issue: Tests fail due to missing harness

**Solution**:

- Ensure dev dependencies are installed: `pnpm install`
- Run: `make test` (activates VS Code test runner)  
- For E2E/visual tests, see `docs/ROADMAP.md` quality gates.

---

## Other Issues

### Issue: The extension seems to have crashed or is unresponsive

**Solution**:

1. **Open Developer Tools**: Use the **Help > Toggle Developer Tools** menu in VS Code to open the console.
2. **Check for Errors**: Look for any red error messages in the console that might indicate what went wrong.
3. **Report the Issue**: Please [file an issue on GitHub](https://github.com/jpantsjoha/c4x-vscode-extension/issues) and include the error message and steps to reproduce it.

---

## Contact & Support

If your issue is not listed here, please reach out:

- **GitHub Issues**: [Create a new issue](https://github.com/jpantsjoha/c4x-vscode-extension/issues)
