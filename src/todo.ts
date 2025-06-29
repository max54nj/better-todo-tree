import * as vscode from 'vscode'

const DEFAULT_INCLUDE_PATTERNS = [
  '**/*.{ts,js,tsx,jsx,py,java,cpp,c,cs,php,rb,go,rs,vue,svelte}',
]

const DEFAULT_PATTERNS = ['TODO', 'FIXME', 'BUG']

const DEFAULT_EXCLUDE_PATTERNS = [
  '**/{node_modules,dist,.next,out,build,.git,coverage,.vscode,.idea,target,bin,obj,vendor}/**',
]

export class Todo {
  public readonly label: string
  public readonly filePath: string
  public readonly line: number
  public readonly text: string

  public constructor(
    label: string,
    filePath: string,
    line: number,
    text: string
  ) {
    this.label = label
    this.filePath = filePath
    this.line = line
    this.text = text
  }

  public get description(): string {
    const todoPattern = new RegExp(
      `\\b${this.label}\\b\\s*[:\\-]?\\s*(.*)`,
      'i'
    )
    const match = this.text.match(todoPattern)

    if (match && match[1]) {
      let desc = match[1].trim()

      desc = desc.replace(/\*\/\s*$/, '').trim()
      return desc || this.text.trim()
    }

    return this.text.trim()
  }
}

export class Todos {
  public static todos: Todo[] = []

  public static get patterns(): string[] {
    const config = vscode.workspace.getConfiguration('simpleTodoTree')
    return config.get<string[]>('todoPatterns', DEFAULT_PATTERNS)
  }

  public static get includePatterns(): string[] {
    const config = vscode.workspace.getConfiguration('simpleTodoTree')
    return config.get<string[]>('includePatterns', DEFAULT_INCLUDE_PATTERNS)
  }

  public static get excludePatterns(): string[] {
    const config = vscode.workspace.getConfiguration('simpleTodoTree')
    return config.get<string[]>('excludePatterns', DEFAULT_EXCLUDE_PATTERNS)
  }

  public static async scan() {
    this.todos = []

    const includePatterns = this.includePatterns
    const excludePatterns = this.excludePatterns

    for (const includePattern of includePatterns) {
      const files = await vscode.workspace.findFiles(
        includePattern,
        `${excludePatterns.join(',')}`
      )

      for (const file of files) {
        await this.scanFile(file.fsPath)
      }
    }
  }

  public static async scanFile(filePath: string): Promise<Todo[]> {
    const pattern = `\\b(${this.patterns.join('|')})\\b`
    const regex = new RegExp(pattern, 'gi')
    const newTodos: Todo[] = []

    try {
      const openDocument = vscode.workspace.textDocuments.find(
        (doc) => doc.fileName === filePath && doc.isDirty
      )

      let text: string
      if (openDocument) {
        text = openDocument.getText()
      } else {
        const document = await vscode.workspace.openTextDocument(filePath)
        text = document.getText()
      }

      const lines = text.split('\n')

      lines.forEach((lineText, index) => {
        const match = lineText.match(regex)
        if (match) {
          let matchResult
          const lineRegex = new RegExp(pattern, 'gi')
          while ((matchResult = lineRegex.exec(lineText)) !== null) {
            const todo = new Todo(
              matchResult[1].toUpperCase(),
              filePath,
              index + 1,
              lineText.trim()
            )
            newTodos.push(todo)
            this.todos.push(todo)
          }
        }
      })
    } catch (err) {
      console.error(`Error scanning file ${filePath}:`, err)
    }

    return newTodos
  }

  public static updateFile(filePath: string): Promise<Todo[]> {
    this.todos = this.todos.filter((todo) => todo.filePath !== filePath)
    return this.scanFile(filePath)
  }

  public static isRelevantFile(filePath: string): boolean {
    const includePatterns = this.includePatterns

    return includePatterns.some((pattern) => {
      const extMatch = pattern.match(/\*\*\/\*\.{([^}]+)}/)
      if (extMatch) {
        const extensions = extMatch[1].split(',').map((ext) => '.' + ext.trim())
        const fileExt = filePath.substring(filePath.lastIndexOf('.'))
        return extensions.includes(fileExt)
      }

      const singleExtMatch = pattern.match(/\*\*\/\*\.(.+)$/)
      if (singleExtMatch) {
        const fileExt = filePath.substring(filePath.lastIndexOf('.'))
        return fileExt === '.' + singleExtMatch[1]
      }

      return pattern.includes('*')
    })
  }
}
