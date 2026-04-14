import type { DependencyEngine } from "./dependencies.ts"
import type { WorkItemStore } from "./store.ts"
import type {
  GanttBar,
  GanttView,
  KanbanColumn,
  KanbanView,
  ListFilter,
  WorkItem,
} from "./types.ts"

function matches(item: WorkItem, filter: ListFilter): boolean {
  if (filter.kind && !filter.kind.includes(item.kind)) return false
  if (filter.status && !filter.status.includes(item.status)) return false
  if (filter.owner && item.owner !== filter.owner) return false
  if (filter.tag && !(item.tags ?? []).includes(filter.tag)) return false
  if (filter.parentId !== undefined && item.parentId !== filter.parentId) return false
  return true
}

export function toListView(store: WorkItemStore, filter: ListFilter = {}): WorkItem[] {
  return store
    .list()
    .filter((i) => matches(i, filter))
    .sort((a, b) => b.createdAt - a.createdAt)
}

export function toKanbanView(
  store: WorkItemStore,
  field: KanbanView["field"],
  filter: ListFilter = {},
): KanbanView {
  const items = toListView(store, filter)
  const buckets = new Map<string, WorkItem[]>()
  for (const item of items) {
    const key = String(item[field as keyof WorkItem] ?? "unassigned")
    const bucket = buckets.get(key) ?? []
    bucket.push(item)
    buckets.set(key, bucket)
  }
  const columns: KanbanColumn[] = [...buckets.entries()].map(([key, items]) => ({
    key,
    items,
  }))
  columns.sort((a, b) => a.key.localeCompare(b.key))
  return { field, columns }
}

export function toGanttView(
  store: WorkItemStore,
  deps: DependencyEngine,
  rootIds: string[],
  now: number = Date.now(),
): GanttView {
  const critical = deps.criticalPath(rootIds)
  const criticalSet = new Set(critical.items)
  const seen = new Set<string>()
  const queue = [...rootIds]
  const bars: GanttBar[] = []
  while (queue.length > 0) {
    const id = queue.shift()
    if (!id || seen.has(id)) continue
    seen.add(id)
    const item = store.get(id)
    const start = item.startAt ?? now
    const estimate = item.estimateMs ?? 0
    bars.push({
      id: item.id,
      title: item.title,
      startAt: start,
      endAt: start + estimate,
      onCriticalPath: criticalSet.has(item.id),
    })
    for (const dep of deps.outgoing(id)) queue.push(dep.to)
  }
  return { now, bars, critical: critical.items }
}
