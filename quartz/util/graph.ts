import type { ContentDetails } from "../plugins/emitters/contentIndex"
import { simplifySlug, type FullSlug, type SimpleSlug } from "./path"

/** Filter the graph's view without removing any pages from search or navigation. */
export function getGraphData(
  index: Record<string, ContentDetails>,
): Map<SimpleSlug, ContentDetails> {
  return new Map(
    Object.entries(index)
      .filter(([, page]) => page.excludeFromGraph !== true)
      .map(([slug, page]) => [simplifySlug(slug as FullSlug), page]),
  )
}
