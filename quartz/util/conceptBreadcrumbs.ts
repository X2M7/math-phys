import type { QuartzPluginData } from "../plugins/vfile"
import { getConceptPlacements } from "./conceptTree"
import { getDictionaryConcepts } from "./dictionary"
import { FullSlug, simplifySlug } from "./path"

export interface ConceptBreadcrumbTrail {
  node: string
  lang: "zh" | "en"
  crumbs: { displayName: string; slug: FullSlug }[]
}

const pagesByBuild = new WeakMap<QuartzPluginData[], Map<string, QuartzPluginData>>()

/** The default follows the tree's curated order, independently of file traversal order. */
export function getConceptBreadcrumbTrails(
  file: QuartzPluginData,
  allFiles: QuartzPluginData[],
): ConceptBreadcrumbTrail[] {
  if (!file.frontmatter?.concept) return []
  const concept = getDictionaryConcepts(allFiles).find((entry) => entry.slug === file.slug)
  if (!concept) return []
  let pages = pagesByBuild.get(allFiles)
  if (!pages) {
    pages = new Map(allFiles.map((entry) => [entry.slug!, entry]))
    pagesByBuild.set(allFiles, pages)
  }
  const order = (slug: FullSlug) => {
    const parts = simplifySlug(slug).split("/").filter(Boolean)
    return parts.slice(1).map((_, index) => {
      const ancestor = `${parts.slice(0, index + 2).join("/")}/index`
      return Number(pages.get(ancestor)?.frontmatter?.navOrder ?? Number.MAX_SAFE_INTEGER)
    })
  }
  const placements = [...(getConceptPlacements(allFiles).get(concept.id) ?? [])].sort((a, b) => {
    const left = order(a.zh)
    const right = order(b.zh)
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      if (left[index] !== right[index]) return left[index] - right[index]
    }
    return left.length - right.length || a.node.localeCompare(b.node, "en")
  })
  return placements.flatMap((placement) =>
    (["zh", "en"] as const).flatMap((lang) => {
      const target = placement[lang]
      if (!target) return []
      const labels = lang === "zh" ? placement.pathZh : placement.pathEn
      const parts = simplifySlug(target).split("/").filter(Boolean)
      if (parts.length !== labels.length + 1) {
        throw new Error(`${target}: concept-tree path does not match its hierarchy`)
      }
      const wiki = `${lang}/index` as FullSlug
      return [
        {
          node: placement.node,
          lang,
          crumbs: [
            {
              displayName:
                pages.get(wiki)?.frontmatter?.title ??
                (lang === "zh" ? "数学物理 Wiki" : "Math-Phys Wiki"),
              slug: wiki,
            },
            ...labels.map((displayName, index) => ({
              displayName,
              slug: `${parts.slice(0, index + 2).join("/")}/index` as FullSlug,
            })),
            { displayName: concept[lang], slug: concept.slug },
          ],
        },
      ]
    }),
  )
}

/** URL context may only select a classification actually rendered for this concept. */
export function selectConceptBreadcrumbTrail(
  trails: Pick<ConceptBreadcrumbTrail, "node" | "lang">[],
  params: URLSearchParams,
): number {
  const node = params.get("tree")
  const lang = params.get("lang") === "en" ? "en" : "zh"
  const index = trails.findIndex((trail) => trail.node === node && trail.lang === lang)
  return index < 0 ? 0 : index
}
