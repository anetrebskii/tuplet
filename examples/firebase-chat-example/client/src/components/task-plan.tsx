import { useState } from 'react'
import { ChevronDown, ChevronUp, CheckCircle2, Loader2, Circle, StopCircle } from 'lucide-react'
import type { TaskItem } from '@/types'

interface TaskPlanProps {
  tasks: TaskItem[]
  defaultExpanded?: boolean
  interrupted?: boolean
}

export function TaskPlan({ tasks, defaultExpanded = false, interrupted = false }: TaskPlanProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  if (tasks.length === 0) return null

  const completed = tasks.filter((t) => t.status === 'completed').length
  const total = tasks.length
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div className="my-2 rounded-lg border border-border bg-card/50 overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span className="font-medium text-foreground">Plan</span>
        <span className="text-xs text-muted-foreground">{completed}/{total}</span>
        <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden mx-2">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${percent}%` }}
          />
        </div>
        {interrupted ? (
          <StopCircle className="h-3.5 w-3.5 text-warning" />
        ) : percent === 100 ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        ) : (
          <span className="text-xs text-muted-foreground">{percent}%</span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-1">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} interrupted={interrupted} />
          ))}
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, interrupted }: { task: TaskItem; interrupted: boolean }) {
  const isInterrupted = interrupted && task.status !== 'completed'

  return (
    <div className="flex items-center gap-2 py-0.5 text-xs">
      <TaskStatusIcon status={task.status} interrupted={isInterrupted} />
      <span className={isInterrupted ? 'text-muted-foreground' : 'text-foreground/80'}>
        {task.status === 'in_progress' && task.activeForm ? task.activeForm : task.subject}
      </span>
    </div>
  )
}

function TaskStatusIcon({ status, interrupted }: { status: string; interrupted: boolean }) {
  if (interrupted) {
    return <StopCircle className="h-3.5 w-3.5 text-warning shrink-0" />
  }
  if (status === 'completed') {
    return <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
  }
  if (status === 'in_progress') {
    return <Loader2 className="h-3.5 w-3.5 text-primary animate-spin shrink-0" />
  }
  return <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
}
