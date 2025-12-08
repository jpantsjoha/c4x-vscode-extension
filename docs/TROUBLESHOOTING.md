# Troubleshooting Guide
>
> Status (2025-11-24): Current repository state is M0 (scaffolding). The preview shows a Hello C4X panel; full parsing/rendering and Markdown fenced blocks are landing in upcoming milestones. Use this guide with that context.

**Version**: 0.2.1
**Last Updated**: 2025-11-24

This guide helps you resolve common issues with the C4X extension.

---

## Preview Panel Issues (M0 baseline)

### Issue: The preview panel is blank, empty, or shows a loading indicator that never disappears

**Cause**: In M0, the preview panel intentionally renders a Hello C4X panel. Parser/rendering errors only apply once the renderer is wired (M1+).

**Solution**:

1. Confirm the extension is running: Execute “C4X: Open Preview” from the Command Palette.  
2. Ensure you launched the Extension Development Host (F5) and built the bundle: `make build`.  
3. Once the renderer is integrated (M1+), if you see parse errors, then:
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

## Markdown Integration Issues (Deferred to v1.1)

### Issue: The C4X diagram is not rendering in the Markdown preview; it just shows the code block

**Cause**: Markdown fenced-block rendering is planned for v1.1; current builds don’t render diagrams inside Markdown.

**Solution**:

1. Use standalone `.c4x` or `.puml` files with the preview panel for now.  
2. Track progress in `docs/ROADMAP.md` (Markdown async rendering milestone).  
3. After v1.1 lands, verify code fences use exactly ```c4x and review workspace trust.

---

## Performance Issues

### Issue: The preview is slow to update for very large diagrams

**Cause**: While C4X is fast, extremely large diagrams (hundreds of elements) can take longer to parse and lay out.

**Solution**:

1. **Check Diagram Size**: For diagrams with over 200 elements, expect a minor delay (over 500ms).
2. **Break Down Diagrams**: Very large diagrams can be difficult for anyone to read. Consider breaking them down into smaller, more focused diagrams (e.g., separate C2 diagrams for different parts of a system).
3. **File an Issue**: If you believe performance is slow for a reasonably sized diagram, please [file an issue on GitHub](https://github.com/jpantsjoha/c4model-vscode-extension/issues) with an example file.

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
3. **Report the Issue**: Please [file an issue on GitHub](https://github.com/jpantsjoha/c4model-vscode-extension/issues) and include the error message and steps to reproduce it.

---

## Contact & Support

If your issue is not listed here, please reach out:

- **GitHub Issues**: [Create a new issue](https://github.com/jpantsjoha/c4model-vscode-extension/issues)
