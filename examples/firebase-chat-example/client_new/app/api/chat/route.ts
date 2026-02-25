import {
  convertToModelMessages,
  streamText,
  tool,
  UIMessage,
  stepCountIs,
} from "ai"
import { z } from "zod"

export const maxDuration = 60

const readFileTool = tool({
  description:
    "Read the contents of a file at the given path. Use this when you need to examine existing code or configuration files.",
  inputSchema: z.object({
    path: z.string().describe("The file path to read"),
  }),
  execute: async ({ path }) => {
    // Simulated file reading
    const files: Record<string, string> = {
      "/src/app/page.tsx": `import { Header } from "@/components/header"\nimport { Sidebar } from "@/components/sidebar"\n\nexport default function Home() {\n  return (\n    <main className="flex min-h-screen">\n      <Sidebar />\n      <div className="flex-1 flex flex-col">\n        <Header />\n        <div className="flex-1 p-6">\n          <h1 className="text-2xl font-bold mb-4">Welcome</h1>\n        </div>\n      </div>\n    </main>\n  )\n}`,
      "/src/components/header.tsx": `"use client"\nimport { Bell, Search, Settings } from "lucide-react"\n\nexport function Header() {\n  return (\n    <header className="h-14 border-b flex items-center px-6 gap-4">\n      <div className="flex-1">\n        <input placeholder="Search..." className="w-full pl-10 pr-4 py-2 rounded-lg" />\n      </div>\n    </header>\n  )\n}`,
      "/package.json": `{\n  "name": "my-project",\n  "version": "0.1.0",\n  "dependencies": {\n    "next": "^16.0.0",\n    "react": "^19.0.0"\n  }\n}`,
    }
    return files[path] || `File not found: ${path}`
  },
})

const writeFileTool = tool({
  description:
    "Write content to a file at the given path. Use this to create new files or overwrite existing ones.",
  inputSchema: z.object({
    path: z.string().describe("The file path to write to"),
    content: z.string().describe("The content to write to the file"),
  }),
  execute: async ({ path, content }) => {
    return `Successfully wrote ${content.length} characters to ${path}`
  },
})

const editFileTool = tool({
  description:
    "Edit a specific part of a file by providing the old text to find and the new text to replace it with.",
  inputSchema: z.object({
    path: z.string().describe("The file path to edit"),
    oldText: z.string().describe("The exact text to find and replace"),
    newText: z.string().describe("The new text to replace with"),
  }),
  execute: async ({ path, oldText, newText }) => {
    return `Successfully edited ${path}: replaced ${oldText.length} chars with ${newText.length} chars`
  },
})

const runCommandTool = tool({
  description:
    "Run a shell command in the project directory. Use for installing packages, running scripts, or checking project status.",
  inputSchema: z.object({
    command: z.string().describe("The shell command to execute"),
  }),
  execute: async ({ command }) => {
    // Simulated command execution
    const outputs: Record<string, string> = {
      "ls -la": `total 128\ndrwxr-xr-x  12 user  staff   384 Feb 23 10:00 .\n-rw-r--r--   1 user  staff   521 Feb 23 10:00 package.json\n-rw-r--r--   1 user  staff   234 Feb 23 10:00 tsconfig.json\ndrwxr-xr-x   6 user  staff   192 Feb 23 10:00 src\ndrwxr-xr-x 480 user  staff 15360 Feb 23 10:00 node_modules`,
      "npm run build": `> my-project@0.1.0 build\n> next build\n\n   Creating an optimized production build ...\n   Compiled successfully\n   Route (app)                              Size\n   /                                        5.2 kB\n   /api/chat                                1.1 kB\n\n   Build completed successfully.`,
      "npm test": `> my-project@0.1.0 test\n> jest\n\nPASS src/__tests__/utils.test.ts\n  ✓ cn merges classes correctly (3ms)\n  ✓ formatDate returns correct format (1ms)\n\nTest Suites: 1 passed, 1 total\nTests:       2 passed, 2 total`,
    }

    if (command.startsWith("npm install") || command.startsWith("pnpm add")) {
      const pkg = command.split(" ").slice(2).join(" ")
      return `added 1 package: ${pkg}\n\n1 package is looking for funding\n  run \`npm fund\` for details`
    }

    return outputs[command] || `$ ${command}\nCommand executed successfully.`
  },
})

const listFilesTool = tool({
  description: "List files and directories at a given path. Use to explore the project structure.",
  inputSchema: z.object({
    path: z.string().describe("The directory path to list"),
  }),
  execute: async ({ path }) => {
    const tree: Record<string, string[]> = {
      "/": ["src/", "package.json", "tsconfig.json", "next.config.mjs", ".env.local", "node_modules/"],
      "/src": ["app/", "components/", "lib/"],
      "/src/app": ["page.tsx", "layout.tsx", "globals.css", "api/"],
      "/src/app/api": ["chat/"],
      "/src/app/api/chat": ["route.ts"],
      "/src/components": ["header.tsx", "sidebar.tsx", "button.tsx", "card.tsx"],
      "/src/lib": ["utils.ts", "db.ts"],
    }
    const normalizedPath = path.replace(/\/$/, "") || "/"
    const files = tree[normalizedPath]
    return files ? files.join("\n") : `Directory not found: ${path}`
  },
})

const searchFilesTool = tool({
  description:
    "Search for a text pattern across all project files. Returns matching files and line numbers.",
  inputSchema: z.object({
    pattern: z.string().describe("The text or regex pattern to search for"),
    path: z.string().optional().describe("Optional directory to limit search scope"),
  }),
  execute: async ({ pattern }) => {
    return `Found matches for "${pattern}":\n\nsrc/app/page.tsx:3:  import { Header } from "@/components/header"\nsrc/components/header.tsx:1:  "use client"\nsrc/lib/utils.ts:5:  export function cn(...inputs: ClassValue[]) {`
  },
})

const tools = {
  readFile: readFileTool,
  writeFile: writeFileTool,
  editFile: editFileTool,
  runCommand: runCommandTool,
  listFiles: listFilesTool,
  searchFiles: searchFilesTool,
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json()

  const result = streamText({
    model: "openai/gpt-5",
    system: `You are CodePilot, an expert AI coding assistant similar to Claude Code. You help developers by reading, writing, and editing code files, running terminal commands, and navigating project structures.

Key behaviors:
- When asked about code, ALWAYS use readFile to examine the actual code first before responding
- When asked to make changes, use editFile or writeFile with the actual code changes
- When exploring a project, use listFiles to understand the structure
- When searching for patterns or usage, use searchFiles
- When running commands (build, test, install), use runCommand
- Always explain what you're doing and why
- Format code responses with proper markdown code blocks
- Be thorough - read related files to understand context before making changes
- After making changes, explain what was changed and why

You work within a Next.js project structure. Be precise with file paths.`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(8),
  })

  return result.toUIMessageStreamResponse()
}
