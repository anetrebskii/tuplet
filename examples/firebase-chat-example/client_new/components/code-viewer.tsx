"use client"

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import { X, Copy, Check, FileCode } from "lucide-react"
import { useState, useCallback } from "react"

const sampleFiles: Record<string, { content: string; language: string }> = {
  "/src/app/page.tsx": {
    language: "tsx",
    content: `import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"

export default function Home() {
  return (
    <main className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <div className="flex-1 p-6">
          <h1 className="text-2xl font-bold mb-4">
            Welcome to your project
          </h1>
          <p className="text-muted-foreground">
            Start building something amazing.
          </p>
        </div>
      </div>
    </main>
  )
}`,
  },
  "/src/app/layout.tsx": {
    language: "tsx",
    content: `import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "My Project",
  description: "Built with Next.js",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
}`,
  },
  "/src/app/globals.css": {
    language: "css",
    content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 255, 255, 255;
  --background-rgb: 10, 10, 30;
}

body {
  color: rgb(var(--foreground-rgb));
  background: rgb(var(--background-rgb));
}`,
  },
  "/src/app/api/chat/route.ts": {
    language: "typescript",
    content: `import { streamText, convertToModelMessages } from "ai"

export const maxDuration = 30

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: "openai/gpt-5",
    system: "You are a helpful coding assistant.",
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}`,
  },
  "/src/components/header.tsx": {
    language: "tsx",
    content: `"use client"

import { Bell, Search, Settings } from "lucide-react"

export function Header() {
  return (
    <header className="h-14 border-b flex items-center px-6 gap-4">
      <div className="flex-1">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
          <input
            placeholder="Search..."
            className="w-full pl-10 pr-4 py-2 rounded-lg border bg-muted"
          />
        </div>
      </div>
      <button className="p-2 rounded-lg hover:bg-muted">
        <Bell className="h-4 w-4" />
      </button>
      <button className="p-2 rounded-lg hover:bg-muted">
        <Settings className="h-4 w-4" />
      </button>
    </header>
  )
}`,
  },
  "/src/components/sidebar.tsx": {
    language: "tsx",
    content: `"use client"

import Link from "next/link"
import { Home, Users, Settings, BarChart } from "lucide-react"

const navItems = [
  { href: "/", icon: Home, label: "Dashboard" },
  { href: "/users", icon: Users, label: "Users" },
  { href: "/analytics", icon: BarChart, label: "Analytics" },
  { href: "/settings", icon: Settings, label: "Settings" },
]

export function Sidebar() {
  return (
    <aside className="w-64 border-r h-screen flex flex-col">
      <div className="p-4 border-b">
        <h1 className="font-bold text-lg">My App</h1>
      </div>
      <nav className="flex-1 p-2">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted"
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}`,
  },
  "/src/components/button.tsx": {
    language: "tsx",
    content: `import { cn } from "@/lib/utils"
import { Slot } from "@radix-ui/react-slot"
import { forwardRef } from "react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "ghost"
  size?: "sm" | "md" | "lg"
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "md", asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-md font-medium",
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"`,
  },
  "/src/components/card.tsx": {
    language: "tsx",
    content: `import { cn } from "@/lib/utils"

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {}

export function Card({ className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-6 shadow-sm",
        className
      )}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: CardProps) {
  return <div className={cn("mb-4", className)} {...props} />
}

export function CardTitle({ className, ...props }: CardProps) {
  return <h3 className={cn("text-lg font-semibold", className)} {...props} />
}

export function CardContent({ className, ...props }: CardProps) {
  return <div className={cn("", className)} {...props} />
}`,
  },
  "/src/lib/utils.ts": {
    language: "typescript",
    content: `import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}`,
  },
  "/src/lib/db.ts": {
    language: "typescript",
    content: `// Database connection utility
// Replace with your actual database configuration

interface DatabaseConfig {
  host: string
  port: number
  database: string
}

const config: DatabaseConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "mydb",
}

export async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  // Implement your database query logic here
  console.log("Executing query:", sql, params)
  return [] as T[]
}

export default config`,
  },
  "/package.json": {
    language: "json",
    content: `{
  "name": "my-project",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "ai": "^6.0.0",
    "@ai-sdk/react": "^3.0.0",
    "lucide-react": "^0.400.0",
    "tailwind-merge": "^2.2.0",
    "clsx": "^2.1.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/react": "^19.0.0",
    "tailwindcss": "^4.0.0"
  }
}`,
  },
  "/tsconfig.json": {
    language: "json",
    content: `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}`,
  },
  "/next.config.mjs": {
    language: "javascript",
    content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
  },
}

export default nextConfig`,
  },
  "/.env.local": {
    language: "bash",
    content: `# Environment variables
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
NEXT_PUBLIC_APP_URL=http://localhost:3000`,
  },
}

const customStyle = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: "transparent",
    margin: 0,
    padding: 0,
    fontSize: "13px",
    lineHeight: "1.7",
  },
  'code[class*="language-"]': {
    ...oneDark['code[class*="language-"]'],
    background: "transparent",
    fontSize: "13px",
  },
}

interface CodeViewerProps {
  filePath: string | null
  onClose: () => void
}

export function CodeViewer({ filePath, onClose }: CodeViewerProps) {
  const [copied, setCopied] = useState(false)
  const file = filePath ? sampleFiles[filePath] : null

  const handleCopy = useCallback(() => {
    if (file) {
      navigator.clipboard.writeText(file.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [file])

  if (!file || !filePath) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-background text-muted-foreground">
        <FileCode className="h-12 w-12 mb-3 opacity-30" />
        <p className="text-sm">Select a file to view its contents</p>
      </div>
    )
  }

  const fileName = filePath.split("/").pop() || filePath
  const lines = file.content.split("\n")

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border bg-card/50">
        <div className="flex items-center gap-2 px-3 py-2 border-r border-border bg-background text-xs text-foreground">
          <FileCode className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono">{fileName}</span>
          <button
            onClick={onClose}
            className="ml-1 p-0.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close file"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          className="px-2 py-1 mr-2 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-success" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Breadcrumb */}
      <div className="px-3 py-1.5 border-b border-border bg-card/30">
        <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
          {filePath.split("/").filter(Boolean).map((segment, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/50">/</span>}
              <span className={i === arr.length - 1 ? "text-foreground" : ""}>{segment}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Code content */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-h-full">
          {/* Line numbers */}
          <div className="shrink-0 select-none bg-card/20 border-r border-border/50">
            {lines.map((_, i) => (
              <div
                key={i}
                className="px-3 py-0 text-right text-xs font-mono text-muted-foreground/40 leading-[1.7]"
                style={{ fontSize: "13px" }}
              >
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code */}
          <div className="flex-1 pl-4 py-0 overflow-x-auto">
            <SyntaxHighlighter
              style={customStyle}
              language={file.language}
              PreTag="div"
              showLineNumbers={false}
            >
              {file.content}
            </SyntaxHighlighter>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-card/30 text-[10px] font-mono text-muted-foreground/60">
        <div className="flex items-center gap-3">
          <span>{file.language.toUpperCase()}</span>
          <span>{lines.length} lines</span>
        </div>
        <div className="flex items-center gap-3">
          <span>UTF-8</span>
          <span>LF</span>
        </div>
      </div>
    </div>
  )
}
