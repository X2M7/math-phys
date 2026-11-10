import { readFile } from "node:fs/promises"
import path from "node:path"

export interface TreeNode {
  id: string
  zh: string
  en: string
  descriptionZh: string
  descriptionEn: string
  periodZh?: string
  periodEn?: string
  sources?: { title: string; url: string }[]
  concepts: string[]
  children: TreeNode[]
}

export interface TreeEntry {
  node: TreeNode
  ancestors: TreeNode[]
  segments: string[]
  order: number
  allConcepts: Set<string>
}

export const rootOrder = [
  "foundations_of_mathematics",
  "algebra",
  "number_theory",
  "geometry",
  "analysis",
  "probability_statistics",
  "topology",
  "discrete_mathematics",
  "numerical_mathematics",
  "physics",
]

export async function readTree(root: string): Promise<TreeNode[]> {
  const parts = await Promise.all(
    ["foundations-algebra", "analysis-geometry", "physics"].map(async (name) => {
      const parsed = JSON.parse(
        await readFile(path.join(root, "data/concept-tree", `${name}.json`), "utf8"),
      ) as { roots: TreeNode[] }
      if (!Array.isArray(parsed.roots)) throw new Error(`${name}: roots must be an array`)
      return parsed.roots
    }),
  )
  const roots = parts.flat()
  const ids = roots.map((node) => node.id)
  if (ids.length !== rootOrder.length || rootOrder.some((id) => !ids.includes(id))) {
    throw new Error(`Expected these concept-tree roots: ${rootOrder.join(", ")}`)
  }
  return roots.sort((a, b) => rootOrder.indexOf(a.id) - rootOrder.indexOf(b.id))
}

/** One stable concept can occur in several branches; pages themselves have a single parent. */
export function indexTree(roots: TreeNode[], knownIds: Set<string>): TreeEntry[] {
  const result: TreeEntry[] = []
  const seenNodes = new Set<string>()
  const covered = new Set<string>()
  function visit(node: TreeNode, ancestors: TreeNode[], segments: string[], order: number) {
    if (!node || typeof node !== "object") throw new Error("Invalid concept-tree node")
    if (typeof node.id !== "string" || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(node.id)) {
      throw new Error(`Invalid concept-tree ID: ${node.id}`)
    }
    if (seenNodes.has(node.id)) throw new Error(`Duplicate concept-tree ID: ${node.id}`)
    seenNodes.add(node.id)
    if (ancestors.length > 3) throw new Error(`Concept tree is too deep: ${node.id}`)
    for (const key of ["zh", "en", "descriptionZh", "descriptionEn"] as const) {
      if (typeof node[key] !== "string" || !node[key].trim()) {
        throw new Error(`${node.id}: missing ${key}`)
      }
    }
    if (Boolean(node.periodZh) !== Boolean(node.periodEn)) {
      throw new Error(`${node.id}: historical periods must be bilingual`)
    }
    for (const source of node.sources ?? []) {
      if (!source.title || !/^https:\/\/[^\s<>]+$/.test(source.url)) {
        throw new Error(`${node.id}: invalid historical reference`)
      }
    }
    if (!Array.isArray(node.concepts) || !Array.isArray(node.children)) {
      throw new Error(`${node.id}: concepts and children must be arrays`)
    }
    const direct = new Set<string>()
    for (const id of node.concepts) {
      if (!knownIds.has(id)) throw new Error(`${node.id}: unknown concept ${id}`)
      if (direct.has(id)) throw new Error(`${node.id}: duplicate concept ${id}`)
      direct.add(id)
      covered.add(id)
    }
    const parent = ancestors.at(-1)
    if (parent && !node.id.startsWith(`${parent.id}-`)) {
      throw new Error(`${node.id}: child ID must start with ${parent.id}-`)
    }
    const segment = parent ? node.id.slice(parent.id.length + 1) : node.id
    const entry: TreeEntry = {
      node,
      ancestors,
      segments: [...segments, segment],
      order,
      allConcepts: new Set(direct),
    }
    result.push(entry)
    node.children.forEach((child, index) => {
      const descendants = visit(child, [...ancestors, node], entry.segments, index)
      for (const id of descendants) entry.allConcepts.add(id)
    })
    if (entry.allConcepts.size === 0) throw new Error(`${node.id}: empty branch`)
    return entry.allConcepts
  }
  roots.forEach((node, index) => visit(node, [], [], index))
  const missing = [...knownIds].filter((id) => !covered.has(id))
  if (missing.length)
    throw new Error(`Unclassified concepts (${missing.length}): ${missing.join(", ")}`)
  return result
}

export function treeUrl(entry: TreeEntry, lang: "zh" | "en"): string {
  return `/${lang}/${entry.segments.join("/")}/`
}
