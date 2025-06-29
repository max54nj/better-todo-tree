import * as vscode from 'vscode'
import { TodoTreeProvider } from './todoTree'
import { Todos } from './todo'

export function activate(context: vscode.ExtensionContext) {
  const todoTreeProvider = new TodoTreeProvider()

  const refreshCommand = vscode.commands.registerCommand(
    'simple-todo-tree.refresh',
    () => todoTreeProvider.refresh()
  )
  context.subscriptions.push(refreshCommand)

  const treeView = vscode.window.createTreeView('simple-todo-tree-view', {
    treeDataProvider: todoTreeProvider,
  })
  context.subscriptions.push(treeView)

  const debounceTimeouts = new Map<string, NodeJS.Timeout>()

  const getDebounceDelay = () => {
    const config = vscode.workspace.getConfiguration('simpleTodoTree')
    return config.get<number>('debounceDelay', 500)
  }

  const textChangeWatcher = vscode.workspace.onDidChangeTextDocument(
    (event) => {
      const document = event.document

      if (!Todos.isRelevantFile(document.fileName) || !document.isDirty) {
        return
      }

      const filePath = document.fileName

      const existingTimeout = debounceTimeouts.get(filePath)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }

      const timeout = setTimeout(async () => {
        try {
          await todoTreeProvider.updateFile(filePath)
          debounceTimeouts.delete(filePath)
        } catch (error) {
          console.error(`Error during lazy update for ${filePath}:`, error)
        }
      }, getDebounceDelay())

      debounceTimeouts.set(filePath, timeout)
    }
  )
  context.subscriptions.push(textChangeWatcher)

  const fileSaveWatcher = vscode.workspace.onDidSaveTextDocument(
    async (document) => {
      const filePath = document.fileName

      const pendingTimeout = debounceTimeouts.get(filePath)
      if (pendingTimeout) {
        clearTimeout(pendingTimeout)
        debounceTimeouts.delete(filePath)
      }

      if (Todos.isRelevantFile(filePath)) {
        await todoTreeProvider.updateFile(filePath)
      }
    }
  )
  context.subscriptions.push(fileSaveWatcher)

  const configWatcher = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('simpleTodoTree')) {
      todoTreeProvider.refresh()
    }
  })
  context.subscriptions.push(configWatcher)

  const documentCloseWatcher = vscode.workspace.onDidCloseTextDocument(
    (document) => {
      const filePath = document.fileName

      const pendingTimeout = debounceTimeouts.get(filePath)
      if (pendingTimeout) {
        clearTimeout(pendingTimeout)
        debounceTimeouts.delete(filePath)
      }
    }
  )
  context.subscriptions.push(documentCloseWatcher)

  context.subscriptions.push({
    dispose: () => {
      debounceTimeouts.forEach((timeout) => clearTimeout(timeout))
      debounceTimeouts.clear()
    },
  })
}

export function deactivate() {}
