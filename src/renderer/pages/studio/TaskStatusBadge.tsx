import { Badge } from '@cherrystudio/ui'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-muted text-muted-foreground',
  queued: 'bg-muted text-muted-foreground',
  running: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  completed: 'bg-green-500/15 text-green-600 dark:text-green-400',
  failed: 'bg-red-500/15 text-red-600 dark:text-red-400',
  cancelled: 'bg-muted text-muted-foreground',
  retrying: 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
}

export function TaskStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`capitalize ${STATUS_COLORS[status] ?? ''}`}>
      {status}
    </Badge>
  )
}
