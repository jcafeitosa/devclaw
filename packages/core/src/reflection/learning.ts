import type { MemoryService } from "../memory/service.ts"
import type { Lesson } from "./types.ts"

export async function persistLessons(service: MemoryService, lessons: Lesson[]): Promise<string[]> {
  const ids: string[] = []
  for (const lesson of lessons) {
    const tags = new Set([...lesson.tags, "lesson", lesson.relatesTo.taskId])
    const item = await service.write({
      tier: "long",
      kind: "lesson",
      content: lesson.content,
      tags: [...tags],
      meta: {
        taskId: lesson.relatesTo.taskId,
        stepIds: lesson.relatesTo.stepIds.join(","),
      },
    })
    ids.push(item.id)
  }
  return ids
}
