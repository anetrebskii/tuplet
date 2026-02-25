import type { TraceInfo } from '@/types'

interface CostDisplayProps {
  lastTrace: TraceInfo | null
  cumulativeCost: number
}

export function CostDisplay({ lastTrace, cumulativeCost }: CostDisplayProps) {
  if (!lastTrace && cumulativeCost === 0) return null

  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60 font-mono">
      {lastTrace && (
        <span title={`In: ${lastTrace.totalInputTokens} / Out: ${lastTrace.totalOutputTokens} tokens`}>
          Reply: {formatCost(lastTrace.totalCost)}
        </span>
      )}
      {lastTrace && cumulativeCost > 0 && <span className="text-border">|</span>}
      {cumulativeCost > 0 && (
        <span>Total: {formatCost(cumulativeCost)}</span>
      )}
    </div>
  )
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`
  return `$${cost.toFixed(2)}`
}
