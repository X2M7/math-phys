import type { QuartzPluginData } from "../plugins/vfile"
import { isFullSlug, type FullSlug } from "./path"

export interface DictionaryConcept {
  id: string
  zh: string
  en: string
  variants: string[]
  subjects: string[]
  slug: FullSlug
  articles: { title: string; slug: FullSlug }[]
}

const conceptIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const alphabetical = new Intl.Collator("en", { sensitivity: "base", numeric: true })

function invalid(file: QuartzPluginData, message: string): never {
  throw new Error(
    `Dictionary metadata in "${file.slug ?? file.filePath ?? "unknown file"}": ${message}`,
  )
}

function pageSlug(file: QuartzPluginData): FullSlug {
  if (typeof file.slug !== "string" || file.slug.length === 0 || !isFullSlug(file.slug)) {
    invalid(file, "a valid page slug is required for dictionary links")
  }
  return file.slug
}

function requiredText(file: QuartzPluginData, value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(file, `${field} must be a non-empty string`)
  }
  return value.trim()
}

function conceptId(file: QuartzPluginData, value: unknown, field: string): string {
  if (typeof value !== "string" || !conceptIdPattern.test(value)) {
    invalid(file, `${field} must use lowercase kebab-case, for example "tensor-product"`)
  }
  return value
}

function optionalTextList(file: QuartzPluginData, value: unknown, field: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) invalid(file, `${field} must be a list of non-empty strings`)
  return [...new Set(value.map((item) => requiredText(file, item, field)))]
}

/** Build the dictionary from concept records and articles that reference their stable IDs. */
export function collectDictionaryConcepts(allFiles: QuartzPluginData[]): DictionaryConcept[] {
  const concepts = new Map<string, DictionaryConcept>()

  for (const file of allFiles) {
    const raw = file.frontmatter?.concept
    if (raw === undefined) continue
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      invalid(file, "concept must be an object containing id, zh, and en")
    }

    const record = raw as Record<string, unknown>
    const id = conceptId(file, record.id, "concept.id")
    const existing = concepts.get(id)
    if (existing) {
      invalid(file, `duplicate concept.id "${id}"; it is already defined in "${existing.slug}"`)
    }

    concepts.set(id, {
      id,
      zh: requiredText(file, record.zh, "concept.zh"),
      en: requiredText(file, record.en, "concept.en"),
      variants: optionalTextList(file, record.variants, "concept.variants"),
      subjects: optionalTextList(file, record.subjects, "concept.subjects"),
      slug: pageSlug(file),
      articles: [],
    })
  }

  for (const file of allFiles) {
    const references = file.frontmatter?.concepts
    if (references === undefined) continue
    if (!Array.isArray(references)) {
      invalid(file, "concepts must be a list of concept IDs")
    }

    for (const reference of new Set(references)) {
      const id = conceptId(file, reference, "concepts entries")
      const concept = concepts.get(id)
      if (!concept) invalid(file, `concepts references unknown concept ID "${id}"`)
      const slug = pageSlug(file)
      if (slug === concept.slug || concept.articles.some((article) => article.slug === slug))
        continue
      concept.articles.push({ title: file.frontmatter?.title || slug, slug })
    }
  }

  for (const concept of concepts.values()) {
    concept.articles.sort(
      (a, b) => alphabetical.compare(a.title, b.title) || alphabetical.compare(a.slug, b.slug),
    )
  }

  return [...concepts.values()].sort(
    (a, b) => alphabetical.compare(a.en, b.en) || alphabetical.compare(a.id, b.id),
  )
}

const dictionaryByBuild = new WeakMap<QuartzPluginData[], DictionaryConcept[]>()

/**
 * Reuse the index while rendering a build's immutable allFiles snapshot. Emitters
 * create a new array for each build, including incremental preview updates.
 * Call collectDictionaryConcepts directly when working with mutable input.
 */
export function getDictionaryConcepts(allFiles: QuartzPluginData[]): DictionaryConcept[] {
  let concepts = dictionaryByBuild.get(allFiles)
  if (concepts === undefined) {
    concepts = collectDictionaryConcepts(allFiles)
    dictionaryByBuild.set(allFiles, concepts)
  }
  return concepts
}

/** Shared by generated search data and browser filtering; no Node runtime dependencies. */
export function normalizeDictionaryText(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[-\u2010-\u2015\u2212]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function matchesDictionaryQuery(searchText: string, query: string): boolean {
  const normalizedText = normalizeDictionaryText(searchText)
  const terms = normalizeDictionaryText(query).split(" ").filter(Boolean)
  return terms.every((term) => normalizedText.includes(term))
}
