import { Badge } from '@/components/ui/Badge'
import { STATUS_META, type AssignmentStatus } from '@/types'

export function StatusBadge({ status }: { status: AssignmentStatus }) {
  const meta = STATUS_META[status]
  const tone =
    status === 'completed'
      ? 'success'
      : status === 'submitted'
        ? 'warning'
        : status === 'reviewing'
          ? 'info'
          : status === 'revising'
            ? 'brand'
            : status === 'feedback_ready'
              ? 'brand'
              : 'neutral'

  return <Badge tone={tone}>{meta.label}</Badge>
}
