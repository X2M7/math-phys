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

export interface CatalogEntry {
  id: string
  qid: string
  zh: string
  en: string
  variants: string[]
  subjects: string[]
  sources: {
    enWikipedia: WikipediaPage
    zhWikipedia: WikipediaPage
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

export function validateCatalog(catalog: Catalog, subjects: Record<string, string>): void {
  assert.equal(catalog.schemaVersion, 1, "unsupported catalog schema")
  assert.match(catalog.collectedOn, /^\d{4}-\d{2}-\d{2}$/)
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
    assert(entry.subjects.length > 0, `missing subject: ${entry.id}`)
    for (const subject of entry.subjects) assert(subjects[subject], `unknown subject: ${subject}`)
    assert(entry.variants.every((variant) => typeof variant === "string" && variant.trim()))
    for (const [language, page] of [
      ["en", entry.sources.enWikipedia],
      ["zh", entry.sources.zhWikipedia],
    ] as const) {
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
  const metadata = {
    title: `${entry.zh} / ${entry.en}`,
    description: `${entry.zh} — ${entry.en}。中英文名称、参考来源与关联词条。`,
    socialImage: "og-image.png",
    graph: false,
    concept: {
      id: entry.id,
      zh: entry.zh,
      en: entry.en,
      variants: entry.variants,
      subjects: entry.subjects.map((subject) => subjects[subject]),
    },
    dictionarySource: {
      qid: entry.qid,
      collectedOn: catalog.collectedOn,
      translationBasis: "wikipedia-same-wikidata-item",
    },
  }
  const wikipedia = [
    ["中文 Wikipedia", entry.sources.zhWikipedia, "zh"],
    ["English Wikipedia", entry.sources.enWikipedia, "en"],
  ] as const
  const sources = wikipedia.map(
    ([label, page, language]) =>
      `- ${link(`${label}：${page.title}`, page.url)}（${link("采集时版本", `https://${language}.wikipedia.org/w/index.php?oldid=${page.revisionId}`)}）`,
  )
  for (const page of entry.sources.nlab) {
    sources.push(`- ${link(`nLab：${page.title}`, page.url)}`)
  }
  sources.push(
    `- ${link(`Wikidata：${entry.qid}`, entry.sources.wikidata.url)}（${link("采集时版本", `https://www.wikidata.org/w/index.php?oldid=${entry.sources.wikidata.revisionId}`)}）`,
  )
  const variants = entry.variants.length
    ? `\n## 别名 / Variants\n\n${entry.variants.map(plain).join("； ")}\n`
    : ""
  return `---\n${yaml.dump(metadata, { lineWidth: -1, noRefs: true, quotingType: '"' })}---

**${plain(entry.zh)}** · **${plain(entry.en)}**

${entry.subjects.map((subject) => plain(subjects[subject])).join(" · ")}
${variants}
## 参考来源 / Sources

${sources.join("\n")}

中英文名称依据同一 Wikidata 实体对应的 Wikipedia 页面整理。这里收录术语名称与来源索引，定义及说明请参阅原文；译名和别名尚未逐条人工审定。${entry.sources.nlab.length ? "nLab 对应关系经其官方源码快照及 Wikidata 标识核对。" : ""}

采集日期：${catalog.collectedOn}。参阅[收录范围与来源说明](../dictionary-sources)。

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
