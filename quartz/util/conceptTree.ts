import type { QuartzPluginData } from "../plugins/vfile"
import type { FullSlug } from "./path"
import { getDictionaryConcepts } from "./dictionary"

export interface ConceptPlacement {
  node: string
  pathZh: string[]
  pathEn: string[]
  zh: FullSlug
  en?: FullSlug
}

const byBuild = new WeakMap<QuartzPluginData[], Map<string, ConceptPlacement[]>>()

/** Category membership is separate from author-written articles and never duplicates a concept. */
export function collectConceptPlacements(allFiles: QuartzPluginData[]) {
  const known = new Set(getDictionaryConcepts(allFiles).map((concept) => concept.id))
  const pages = new Map<string, Partial<Record<"zh" | "en", QuartzPluginData>>>()
  for (const file of allFiles) {
    const fm = file.frontmatter
    if (fm?.treeNode === undefined) continue
    const lang = fm.lang
    if (typeof fm.treeNode !== "string" || (lang !== "zh" && lang !== "en")) {
      throw new Error(`Invalid concept-tree metadata: ${file.slug}`)
    }
    const node = pages.get(fm.treeNode) ?? {}
    if (node[lang]) throw new Error(`Duplicate concept-tree page: ${fm.treeNode}/${lang}`)
    node[lang] = file
    pages.set(fm.treeNode, node)
    if (!Array.isArray(fm.treeConcepts)) throw new Error(`Missing treeConcepts: ${file.slug}`)
    for (const id of fm.treeConcepts) {
      if (!known.has(id)) throw new Error(`${file.slug}: unknown concept-tree member ${id}`)
    }
    for (const field of ["treePathZh", "treePathEn"]) {
      if (
        !Array.isArray(fm[field]) ||
        !fm[field].length ||
        fm[field].some((part: unknown) => typeof part !== "string" || !part.trim())
      ) {
        throw new Error(`${file.slug}: invalid ${field}`)
      }
    }
  }
  const placements = new Map<string, ConceptPlacement[]>()
  for (const [id, pair] of pages) {
    if (!pair.zh?.slug) throw new Error(`${id}: missing Chinese concept-tree page`)
    if (!pair.en?.slug) throw new Error(`${id}: missing English concept-tree page`)
    const fm = pair.zh.frontmatter!
    if (
      pair.en &&
      JSON.stringify(pair.en.frontmatter?.treeConcepts) !== JSON.stringify(fm.treeConcepts)
    ) {
      throw new Error(`${id}: bilingual concept-tree membership differs`)
    }
    for (const field of ["treePathZh", "treePathEn"]) {
      if (JSON.stringify(pair.en.frontmatter?.[field]) !== JSON.stringify(fm[field])) {
        throw new Error(`${id}: bilingual concept-tree ${field} differs`)
      }
    }
    const placement: ConceptPlacement = {
      node: id,
      pathZh: fm.treePathZh as string[],
      pathEn: fm.treePathEn as string[],
      zh: pair.zh.slug,
      en: pair.en?.slug,
    }
    for (const concept of new Set(fm.treeConcepts as string[])) {
      const memberships = placements.get(concept) ?? []
      memberships.push(placement)
      placements.set(concept, memberships)
    }
  }
  return placements
}

export function getConceptPlacements(allFiles: QuartzPluginData[]) {
  let cached = byBuild.get(allFiles)
  if (!cached) {
    cached = collectConceptPlacements(allFiles)
    byBuild.set(allFiles, cached)
  }
  return cached
}
