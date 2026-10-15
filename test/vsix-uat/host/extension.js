'use strict';

// Test-only bridge for the installed-VSIX acceptance journey (#79).
//
// scripts/test-vsix-installed-uat.js launches the pinned VS Code with the
// packaged C4X VSIX installed in an isolated profile and this folder as the
// development extension. Playwright drives the workbench and the C4X webview
// like a user; this bridge answers the questions a screen cannot: the exact
// text and dirty state of an open document, which copy of C4X is loaded, and
// a source change made "by another editor" for the conflict journey.
//
// It contains no C4X code and never touches the extension under test. It is
// inert unless C4X_UAT_BRIDGE_FILE is set, binds to 127.0.0.1 only, and
// requires the random token it writes to that file.

const http = require('node:http');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const vscode = require('vscode');

const C4X_ID = 'jpantsjoha.c4x';

function documentState(document) {
  return {
    uri: document.uri.toString(),
    fsPath: document.uri.fsPath,
    languageId: document.languageId,
    version: document.version,
    isDirty: document.isDirty,
    text: document.getText(),
  };
}

function reviveArg(value) {
  if (value && typeof value === 'object' && typeof value.$file === 'string') {
    return vscode.Uri.file(value.$file);
  }
  return value;
}

function serialisable(value) {
  if (value === undefined) { return null; }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

const handlers = {
  async state() {
    const c4x = vscode.extensions.getExtension(C4X_ID);
    return {
      vscodeVersion: vscode.version,
      c4x: c4x ? {
        version: c4x.packageJSON.version,
        extensionPath: c4x.extensionPath,
        isActive: c4x.isActive,
      } : null,
      activeEditor: vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.document.uri.fsPath
        : null,
      documents: vscode.workspace.textDocuments
        .filter(document => document.uri.scheme === 'file')
        .map(documentState),
    };
  },

  async document({ file }) {
    const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === file)
      ?? await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    return documentState(document);
  },

  async open({ file, column }) {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: column === 'beside' ? vscode.ViewColumn.Beside : vscode.ViewColumn.One,
    });
    return documentState(document);
  },

  // Runs a command. With wait=false the call returns at once, so a command
  // that opens a dialog or quick pick can be driven through the UI.
  async exec({ command, args = [], wait = true }) {
    const promise = vscode.commands.executeCommand(command, ...args.map(reviveArg));
    if (!wait) {
      promise.then(undefined, error => console.error(`[c4x-uat] ${command} failed`, error));
      return { started: true };
    }
    return { result: serialisable(await promise) };
  },

  // An edit applied by "someone else": inserts text at the start of a line
  // through a WorkspaceEdit, without focusing the document.
  async insert({ file, line, text }) {
    const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === file)
      ?? await vscode.workspace.openTextDocument(vscode.Uri.file(file));
    const edit = new vscode.WorkspaceEdit();
    edit.insert(document.uri, new vscode.Position(line, 0), text);
    const applied = await vscode.workspace.applyEdit(edit);
    return { applied, document: documentState(document) };
  },

  async save({ file }) {
    const document = vscode.workspace.textDocuments.find(doc => doc.uri.fsPath === file);
    if (!document) { throw new Error(`Document is not open: ${file}`); }
    const saved = await document.save();
    return { saved, document: documentState(document) };
  },
};

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function activate(context) {
  const bridgeFile = process.env.C4X_UAT_BRIDGE_FILE;
  if (!bridgeFile) { return; }
  const token = randomUUID();

  const server = http.createServer(async (request, response) => {
    const reply = (status, payload) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(payload));
    };
    if (request.headers['x-c4x-uat-token'] !== token) {
      reply(403, { error: 'bad token' });
      return;
    }
    const name = (request.url || '').replace(/^\//, '');
    const handler = Object.prototype.hasOwnProperty.call(handlers, name) ? handlers[name] : undefined;
    if (!handler) {
      reply(404, { error: `unknown endpoint ${name}` });
      return;
    }
    try {
      reply(200, { ok: true, value: await handler(await readBody(request)) });
    } catch (error) {
      reply(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    fs.writeFileSync(bridgeFile, JSON.stringify({ port: address.port, token, pid: process.pid }));
  });
  context.subscriptions.push({ dispose: () => server.close() });
}

function deactivate() {}

module.exports = { activate, deactivate };
