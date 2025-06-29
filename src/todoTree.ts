import * as path from 'path'
import * as vscode from 'vscode'
import { Todos, Todo } from './todo'

export class TodoTreeProvider implements vscode.TreeDataProvider<TodoNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    TodoNode | undefined | null | void
  > = new vscode.EventEmitter<TodoNode | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<
    TodoNode | undefined | null | void
  > = this._onDidChangeTreeData.event

  public constructor() {}

  async getChildren(element?: TodoNode): Promise<TodoNode[]> {
    const rootPaths = vscode.workspace.workspaceFolders ?? []
    if (rootPaths?.length <= 0) return []

    if (Todos.todos.length === 0) await Todos.scan()

    if (!element) {
      const usedWorkspaces = rootPaths.filter((workspace) =>
        Todos.todos.find((todo) =>
          todo.filePath.startsWith(workspace.uri.fsPath)
        )
      )

      if (usedWorkspaces.length === 0) {
        return [
          new TodoNode(
            'No TODO comments found',
            '',
            0,
            vscode.TreeItemCollapsibleState.None,
            'empty'
          ),
        ]
      }

      return usedWorkspaces.map(
        (workspace) =>
          new TodoNode(
            workspace.name,
            workspace.uri.fsPath,
            0,
            vscode.TreeItemCollapsibleState.Expanded,
            'workspace'
          )
      )
    } else if (element.nodeType === 'workspace') {
      return this.buildFolderStructure(element.filePath)
    } else if (element.nodeType === 'folder') {
      return this.getChildrenForFolder(element.filePath)
    } else if (element.nodeType === 'file') {
      return this.getTodosForFile(element.filePath)
    }

    return []
  }

  private buildFolderStructure(workspacePath: string): TodoNode[] {
    const todosInWorkspace = Todos.todos.filter((todo) =>
      todo.filePath.startsWith(workspacePath)
    )

    const immediateChildren = new Set<string>()
    todosInWorkspace.forEach((todo) => {
      const relativePath = path.relative(workspacePath, todo.filePath)
      const firstPart = relativePath.split(path.sep)[0]
      immediateChildren.add(firstPart)
    })

    const result: TodoNode[] = []

    Array.from(immediateChildren)
      .sort()
      .forEach((item) => {
        const fullPath = path.join(workspacePath, item)
        const isDirectory = todosInWorkspace.some(
          (todo) =>
            todo.filePath !== fullPath &&
            todo.filePath.startsWith(fullPath + path.sep)
        )

        if (isDirectory) {
          const compactedPath = this.getCompactedFolderPath(
            fullPath,
            todosInWorkspace
          )
          const displayName = path.relative(workspacePath, compactedPath.path)

          result.push(
            new TodoNode(
              displayName,
              compactedPath.path,
              0,
              vscode.TreeItemCollapsibleState.Expanded,
              'folder'
            )
          )
        } else {
          const todosInFile = todosInWorkspace.filter(
            (todo) => todo.filePath === fullPath
          )
          if (todosInFile.length > 0) {
            result.push(
              new TodoNode(
                item,
                fullPath,
                0,
                vscode.TreeItemCollapsibleState.Expanded,
                'file'
              )
            )
          }
        }
      })

    return result
  }

  private getCompactedFolderPath(
    folderPath: string,
    todosInWorkspace: Todo[]
  ): { path: string; hasMultipleChildren: boolean } {
    let currentPath = folderPath

    while (true) {
      const children = new Set<string>()
      todosInWorkspace.forEach((todo) => {
        if (todo.filePath.startsWith(currentPath + path.sep)) {
          const relativePath = path.relative(currentPath, todo.filePath)
          const firstPart = relativePath.split(path.sep)[0]
          children.add(firstPart)
        }
      })

      if (children.size !== 1) {
        return { path: currentPath, hasMultipleChildren: children.size > 1 }
      }

      const singleChild = Array.from(children)[0]
      const childPath = path.join(currentPath, singleChild)

      const isChildDirectory = todosInWorkspace.some(
        (todo) =>
          todo.filePath !== childPath &&
          todo.filePath.startsWith(childPath + path.sep)
      )

      if (!isChildDirectory) {
        return { path: currentPath, hasMultipleChildren: false }
      }

      currentPath = childPath
    }
  }

  private getChildrenForFolder(folderPath: string): TodoNode[] {
    const todosInFolder = Todos.todos.filter((todo) =>
      todo.filePath.startsWith(folderPath + path.sep)
    )

    const immediateChildren = new Set<string>()
    todosInFolder.forEach((todo) => {
      const relativePath = path.relative(folderPath, todo.filePath)
      const firstPart = relativePath.split(path.sep)[0]
      immediateChildren.add(firstPart)
    })

    const result: TodoNode[] = []

    Array.from(immediateChildren)
      .sort()
      .forEach((item) => {
        const fullPath = path.join(folderPath, item)
        const isDirectory = todosInFolder.some(
          (todo) =>
            todo.filePath !== fullPath &&
            todo.filePath.startsWith(fullPath + path.sep)
        )

        if (isDirectory) {
          const compactedPath = this.getCompactedFolderPath(
            fullPath,
            todosInFolder
          )
          const displayName = path.relative(folderPath, compactedPath.path)

          result.push(
            new TodoNode(
              displayName,
              compactedPath.path,
              0,
              vscode.TreeItemCollapsibleState.Expanded,
              'folder'
            )
          )
        } else {
          result.push(
            new TodoNode(
              item,
              fullPath,
              0,
              vscode.TreeItemCollapsibleState.Expanded,
              'file'
            )
          )
        }
      })

    return result
  }

  private getTodosForFile(filePath: string): TodoNode[] {
    const todosInFile = Todos.todos.filter((todo) => todo.filePath === filePath)
    return todosInFile.map((todo) => this.parseTodoToTodoNode(todo))
  }

  refresh(): void {
    Todos.todos = []
    this._onDidChangeTreeData.fire()
  }

  async updateFile(filePath: string): Promise<void> {
    const hadTodos = Todos.todos.some((todo) => todo.filePath === filePath)

    await Todos.updateFile(filePath)

    const hasTodos = Todos.todos.some((todo) => todo.filePath === filePath)

    if (hadTodos || hasTodos) {
      this._onDidChangeTreeData.fire()
    }
  }

  getTreeItem(element: TodoNode): vscode.TreeItem {
    return element
  }

  private parseTodoToTodoNode(todo: Todo): TodoNode {
    const displayLabel = `${todo.label} ${todo.description}`

    return new TodoNode(
      displayLabel,
      todo.filePath,
      todo.line,
      vscode.TreeItemCollapsibleState.None,
      'todo'
    )
  }
}

class TodoNode extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly filePath: string,
    public readonly line: number,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly nodeType:
      | 'workspace'
      | 'folder'
      | 'file'
      | 'todo'
      | 'empty' = 'todo'
  ) {
    super(label, collapsibleState)

    if (this.nodeType === 'workspace') {
      this.tooltip = `Workspace: ${this.label}`
      this.iconPath = new vscode.ThemeIcon(
        'folder-opened',
        new vscode.ThemeColor('descriptionForeground')
      )
      this.contextValue = 'workspace'
    } else if (this.nodeType === 'folder') {
      this.tooltip = `Folder: ${this.filePath}`
      this.iconPath = new vscode.ThemeIcon(
        'folder',
        new vscode.ThemeColor('descriptionForeground')
      )
      this.contextValue = 'folder'
    } else if (this.nodeType === 'file') {
      this.tooltip = `File: ${path.basename(this.filePath)}`
      this.iconPath = new vscode.ThemeIcon(
        'file',
        new vscode.ThemeColor('descriptionForeground')
      )
      this.contextValue = 'file'
    } else if (this.nodeType === 'empty') {
      this.tooltip =
        'No TODO, FIXME, or BUG comments found in the workspace. Try adding some TODO comments to your code!'
      this.iconPath = new vscode.ThemeIcon(
        'search-stop',
        new vscode.ThemeColor('descriptionForeground')
      )
      this.contextValue = 'empty'
    } else {
      this.tooltip = `${this.label}\n\n${this.filePath}:${this.line}`
      this.description = `${path.basename(this.filePath)}:${this.line}`
      this.iconPath = new vscode.ThemeIcon('circle-filled')

      this.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [
          vscode.Uri.file(this.filePath),
          {
            selection: new vscode.Range(this.line - 1, 0, this.line - 1, 0),
          },
        ],
      }
    }
  }
}
