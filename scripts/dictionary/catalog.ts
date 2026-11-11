import assert from "node:assert/strict"
import { readFile, mkdir, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import matter from "gray-matter"
import yaml from "js-yaml"

export interface WikipediaPage {
  title: string
  url: string
  pageId: number
  revisionId: number
  titleVariants?: Record<string, string>
  variantRevisionId?: number
}

export interface TranslationReference {
  title: string
  url: string
  publisher: string
  sourceZh: string
  sourceEn: string
  locator?: string
  kind?: string
}

export interface TranslationEvidence {
  basis: "official-terminology" | "academic-usage"
  verifiedOn: string
  sources: TranslationReference[]
  note?: string
}

export interface WikipediaVerification {
  verifiedOn: string
  enQid: string
  enPageId: number
  enRevisionId: number
  zhSitelink: null
}

export interface CatalogEntry {
  id: string
  qid: string
  zh: string
  en: string
  variants: string[]
  subjects: string[]
  translation?: TranslationEvidence
  wikipediaVerification?: WikipediaVerification
  sources: {
    enWikipedia: WikipediaPage
    zhWikipedia?: WikipediaPage
    wikidata: { url: string; revisionId: number }
    nlab: { title: string; url: string; sourcePath: string }[]
  }
}

export interface Catalog {
  schemaVersion: 1
  collectedOn: string
  nlabSnapshot: string
  entries: CatalogEntry[]
}

function simplifiedChinese(entry: CatalogEntry): string {
  if (!entry.sources.zhWikipedia) {
    assert(entry.translation, `missing Chinese translation evidence: ${entry.id}`)
    // This is the reviewed Simplified Chinese name. Keep source spellings in the
    // evidence and aliases; do not invent a Wikipedia title or guess a conversion.
    return entry.zh
  }
  const title = entry.sources.zhWikipedia.titleVariants?.["zh-hans"]
  assert(title && title.trim(), `missing verified Simplified Chinese title: ${entry.id}`)
  return title
}

function validateDate(value: string, label: string): void {
  assert.equal(typeof value, "string", `invalid ${label}`)
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `invalid ${label}`)
  const date = new Date(`${value}T00:00:00Z`)
  assert(Number.isFinite(date.getTime()), `invalid ${label}`)
  assert.equal(date.toISOString().slice(0, 10), value, `invalid ${label}`)
}

function validateTranslation(entry: CatalogEntry): void {
  const translation = entry.translation
  if (!translation) {
    assert(entry.sources.zhWikipedia, `missing Chinese translation evidence: ${entry.id}`)
    return
  }
  assert(
    translation.basis === "official-terminology" || translation.basis === "academic-usage",
    `unsupported Chinese translation basis: ${entry.id}`,
  )
  validateDate(translation.verifiedOn, `translation verification date: ${entry.id}`)
  assert(
    Array.isArray(translation.sources) && translation.sources.length > 0,
    `missing Chinese translation references: ${entry.id}`,
  )
  if (translation.note !== undefined) {
    assert(
      typeof translation.note === "string" && translation.note.trim(),
      `invalid translation note: ${entry.id}`,
    )
  }
  for (const reference of translation.sources) {
    assert(reference && typeof reference === "object", `invalid translation reference: ${entry.id}`)
    for (const field of ["title", "url", "publisher", "sourceZh", "sourceEn"] as const) {
      assert(
        typeof reference[field] === "string" && reference[field].trim(),
        `missing translation reference ${field}: ${entry.id}`,
      )
    }
    for (const field of ["locator", "kind"] as const) {
      if (reference[field] !== undefined) {
        assert(
          typeof reference[field] === "string" && reference[field].trim(),
          `invalid translation reference ${field}: ${entry.id}`,
        )
      }
    }
    assert(!/[\s<>]/u.test(reference.url), `invalid translation reference URL: ${entry.id}`)
    const url = new URL(reference.url)
    assert.equal(url.protocol, "https:", `translation reference must use HTTPS: ${entry.id}`)
    assert(!url.username && !url.password, `translation reference URL has credentials: ${entry.id}`)
    if (reference.sourceZh !== entry.zh) {
      assert(
        entry.variants.includes(reference.sourceZh),
        `missing original translation alias: ${entry.id}`,
      )
    }
  }
}

function validateWikipediaVerification(entry: CatalogEntry): void {
  const verification = entry.wikipediaVerification
  if (!verification) {
    assert(entry.sources.zhWikipedia, `missing Wikipedia verification: ${entry.id}`)
    return
  }
  validateDate(verification.verifiedOn, `Wikipedia verification date: ${entry.id}`)
  assert.equal(verification.enQid, entry.qid, `Wikipedia verification QID mismatch: ${entry.id}`)
  assert.equal(
    verification.enPageId,
    entry.sources.enWikipedia.pageId,
    `Wikipedia verification page ID mismatch: ${entry.id}`,
  )
  assert.equal(
    verification.enRevisionId,
    entry.sources.enWikipedia.revisionId,
    `Wikipedia verification revision ID mismatch: ${entry.id}`,
  )
  assert.equal(
    verification.zhSitelink,
    null,
    `Wikipedia verification must record absent Chinese sitelink: ${entry.id}`,
  )
}

export function validateCatalog(catalog: Catalog, subjects: Record<string, string>): void {
  assert.equal(catalog.schemaVersion, 1, "unsupported catalog schema")
  validateDate(catalog.collectedOn, "catalog collection date")
  assert.match(catalog.nlabSnapshot, /^[a-f0-9]{40}$/)
  const ids = new Set<string>()
  const qids = new Set<string>()
  const pages = new Set<string>()
  for (const entry of catalog.entries) {
    assert.match(entry.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.match(entry.qid, /^Q\d+$/)
    assert(!ids.has(entry.id), `duplicate ID: ${entry.id}`)
    assert(!qids.has(entry.qid), `duplicate Wikidata concept: ${entry.qid}`)
    ids.add(entry.id)
    qids.add(entry.qid)
    assert(entry.en.trim() && entry.zh.trim(), `missing names: ${entry.id}`)
    validateTranslation(entry)
    assert.equal(
      entry.zh,
      simplifiedChinese(entry),
      `Chinese primary title must use zh-hans: ${entry.id}`,
    )
    for (const sourceTitle of [
      entry.sources.zhWikipedia?.title,
      entry.sources.zhWikipedia?.titleVariants?.["zh-hant"],
    ]) {
      if (sourceTitle && sourceTitle !== entry.zh && sourceTitle !== entry.en) {
        assert(
          entry.variants.includes(sourceTitle),
          `missing original Chinese title alias: ${entry.id}`,
        )
      }
    }
    assert(entry.subjects.length > 0, `missing subject: ${entry.id}`)
    for (const subject of entry.subjects) assert(subjects[subject], `unknown subject: ${subject}`)
    assert(entry.variants.every((variant) => typeof variant === "string" && variant.trim()))
    assert(entry.sources.enWikipedia, `missing English Wikipedia page: ${entry.id}`)
    validateWikipediaVerification(entry)
    for (const [language, page] of [
      ["en", entry.sources.enWikipedia],
      ["zh", entry.sources.zhWikipedia],
    ] as const) {
      if (!page) continue
      assert(page.title.trim())
      assert(Number.isSafeInteger(page.pageId) && page.pageId > 0)
      const pageIdentity = `${language}:${page.pageId}`
      assert(!pages.has(pageIdentity), `duplicate Wikipedia page identity: ${pageIdentity}`)
      pages.add(pageIdentity)
      assert(Number.isSafeInteger(page.revisionId) && page.revisionId > 0)
      const url = new URL(page.url)
      assert.equal(url.protocol, "https:")
      assert.equal(url.hostname, `${language}.wikipedia.org`)
      assert(url.pathname.startsWith("/wiki/"))
      if (page.titleVariants) {
        assert(Number.isSafeInteger(page.variantRevisionId) && page.variantRevisionId! > 0)
        assert(Object.values(page.titleVariants).every((title) => title.trim().length > 0))
      }
    }
    assert.equal(entry.sources.wikidata.url, `https://www.wikidata.org/wiki/${entry.qid}`)
    assert(Number.isSafeInteger(entry.sources.wikidata.revisionId))
    assert(entry.sources.wikidata.revisionId > 0)
    for (const page of entry.sources.nlab) {
      assert(page.title.trim() && page.sourcePath.trim())
      const url = new URL(page.url)
      assert.equal(url.protocol, "https:")
      assert.equal(url.hostname, "ncatlab.org")
      assert(url.pathname.startsWith("/nlab/show/"))
    }
  }
}

// Imported titles and aliases are text, never Markdown/HTML supplied by upstream.
function plain(text: string): string {
  return text
    .replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!)
    .replace(/([\\`*_[\]{}()#+.!|$~])/g, "\\$1")
    .replace(/[\r\n]+/g, " ")
}

function link(label: string, url: string): string {
  return `[${plain(label)}](<${url}>)`
}

export function renderConcept(
  entry: CatalogEntry,
  catalog: Pick<Catalog, "collectedOn" | "nlabSnapshot">,
  subjects: Record<string, string>,
): string {
  const chinese = simplifiedChinese(entry)
  const metadata = {
    title: `${chinese} / ${entry.en}`,
    description: `${chinese} — ${entry.en}。中英文名称、参考来源与关联词条。`,
    socialImage: "og-image.png",
    graph: false,
    concept: {
      id: entry.id,
      zh: chinese,
      en: entry.en,
      variants: entry.variants,
      subjects: entry.subjects.map((subject) => subjects[subject]),
    },
    dictionarySource: {
      qid: entry.qid,
      collectedOn: catalog.collectedOn,
      translationBasis: entry.sources.zhWikipedia
        ? "wikipedia-same-wikidata-item"
        : entry.translation!.basis,
      ...(entry.translation ? { translationVerifiedOn: entry.translation.verifiedOn } : {}),
      ...(entry.wikipediaVerification
        ? { wikipediaVerifiedOn: entry.wikipediaVerification.verifiedOn }
        : {}),
    },
  }
  const wikipedia = [
    ["中文 Wikipedia", entry.sources.zhWikipedia, "zh"],
    ["English Wikipedia", entry.sources.enWikipedia, "en"],
  ] as const
  const sources = wikipedia.flatMap(([label, page, language]) =>
    page
      ? [
          `- ${link(`${label}：${language === "zh" ? chinese : page.title}`, page.url)}（${link("采集时版本", `https://${language}.wikipedia.org/w/index.php?oldid=${page.revisionId}`)}）`,
        ]
      : [],
  )
  for (const page of entry.sources.nlab) {
    sources.push(`- ${link(`nLab：${page.title}`, page.url)}`)
  }
  sources.push(
    `- ${link(`Wikidata：${entry.qid}`, entry.sources.wikidata.url)}（${link("采集时版本", `https://www.wikidata.org/w/index.php?oldid=${entry.sources.wikidata.revisionId}`)}）`,
  )
  const translation = entry.translation
  const translationReferences = translation
    ? `

## 中文译名依据 / Chinese translation references

${translation.basis === "official-terminology" ? "术语来源译名" : "学术文献用法"}。核验日期：${translation.verifiedOn}。采用简体名：**${plain(chinese)}**。

${translation.sources
  .map(
    (reference) =>
      `- ${link(reference.title, reference.url)}（${plain(reference.publisher)}）。来源原译名：${plain(reference.sourceZh)}；原文英文：${plain(reference.sourceEn)}。${reference.locator ? `定位：${plain(reference.locator)}。` : ""}`,
  )
  .join("\n")}${translation.note ? `\n\n${plain(translation.note)}` : ""}`
    : ""
  return `---\n${yaml.dump(metadata, { lineWidth: -1, noRefs: true, quotingType: '"' })}---

**${plain(chinese)}** · **${plain(entry.en)}**

${entry.subjects.map((subject) => plain(subjects[subject])).join(" · ")}

## 参考来源 / Sources

${sources.join("\n")}${translationReferences}

采集日期：${catalog.collectedOn}。参阅[收录范围与来源说明](../dictionary#dictionary-sources)。

<!-- 可在这里编写自己的定义、例子、公式与注解。重新运行导入脚本不会覆盖已有文件。 -->
`
}

/** Create missing pages atomically. Existing files, including author edits, are never replaced. */
export async function generateConcepts(
  root: string,
  catalog: Catalog,
  subjects: Record<string, string>,
): Promise<{ created: number; preserved: number }> {
  validateCatalog(catalog, subjects)
  const directory = path.join(root, "content", "concepts")
  await mkdir(directory, { recursive: true })
  let created = 0
  let preserved = 0
  for (const entry of catalog.entries) {
    const target = path.join(directory, `${entry.id}.md`)
    try {
      await writeFile(target, renderConcept(entry, catalog, subjects), { flag: "wx" })
      created++
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      const existing = matter(await readFile(target, "utf8")).data
      assert.equal(existing.concept?.id, entry.id, `existing page has a different ID: ${target}`)
      assert.equal(
        existing.dictionarySource?.qid,
        entry.qid,
        `existing page has a different source: ${target}`,
      )
      preserved++
    }
  }
  return { created, preserved }
}

export async function checkConcepts(root: string, catalog: Catalog): Promise<void> {
  const directory = path.join(root, "content", "concepts")
  const expected = new Map(catalog.entries.map((entry) => [entry.qid, entry.id]))
  const byId = new Map<string, string>()
  const byQid = new Map<string, string>()
  for (const filename of await readdir(directory)) {
    if (!filename.endsWith(".md")) continue
    const metadata = matter(await readFile(path.join(directory, filename), "utf8")).data
    if (!metadata.concept) continue
    const id = metadata.concept.id
    assert(!byId.has(id), `duplicate concept ID in Markdown: ${id}`)
    byId.set(id, filename)
    const qid = metadata.dictionarySource?.qid
    if (qid) {
      assert(
        expected.has(qid),
        `imported page absent from catalog; review before removing: ${filename}`,
      )
      assert.equal(expected.get(qid), id, `imported page ID changed: ${filename}`)
      assert(!byQid.has(qid), `duplicate source entity in Markdown: ${qid}`)
      byQid.set(qid, id)
    }
  }
  for (const entry of catalog.entries) {
    assert(byId.has(entry.id), `missing concept page: ${entry.id}`)
    assert.equal(byQid.get(entry.qid), entry.id, `source/ID mismatch: ${entry.qid}`)
  }
}
