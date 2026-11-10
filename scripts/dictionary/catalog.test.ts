import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { test } from "node:test"
import matter from "gray-matter"
import { Catalog, checkConcepts, generateConcepts, renderConcept, validateCatalog } from "./catalog"

const subjects = { algebra: "代数 / Algebra" }
const catalog: Catalog = {
  schemaVersion: 1,
  collectedOn: "2026-11-10",
  nlabSnapshot: "a".repeat(40),
  entries: [
    {
      id: "tensor-product",
      qid: "Q1163016",
      zh: "张量积",
      en: "Tensor product",
      variants: ["张量乘积", "張量積", "A < B", "C*", "[not a link](https://example.org)", "$x$"],
      subjects: ["algebra"],
      sources: {
        enWikipedia: {
          title: "Tensor product",
          url: "https://en.wikipedia.org/wiki/Tensor_product",
          pageId: 1,
          revisionId: 2,
        },
        zhWikipedia: {
          title: "張量積",
          url: "https://zh.wikipedia.org/wiki/張量積",
          pageId: 3,
          revisionId: 4,
          titleVariants: { "zh-hans": "张量积", "zh-hant": "張量積" },
          variantRevisionId: 6,
        },
        wikidata: { url: "https://www.wikidata.org/wiki/Q1163016", revisionId: 5 },
        nlab: [
          {
            title: "tensor product",
            url: "https://ncatlab.org/nlab/show/tensor+product",
            sourcePath: "pages/1/content.md",
          },
        ],
      },
    },
  ],
}

test("dictionary import preserves author edits byte for byte on subsequent runs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dictionary-import-"))
  try {
    assert.deepEqual(await generateConcepts(root, catalog, subjects), { created: 1, preserved: 0 })
    const target = path.join(root, "content/concepts/tensor-product.md")
    const edited = (await readFile(target, "utf8")) + "\n作者新增：自己的公式 $V \\otimes W$。\n"
    await writeFile(target, edited)
    assert.deepEqual(await generateConcepts(root, catalog, subjects), { created: 0, preserved: 1 })
    assert.equal(await readFile(target, "utf8"), edited)
    await checkConcepts(root, catalog)
    await assert.rejects(checkConcepts(root, { ...catalog, entries: [] }), /absent from catalog/)
    await writeFile(target, edited.replace("qid: Q1163016", "qid: Q999"))
    await assert.rejects(generateConcepts(root, catalog, subjects), /different source/)
    assert.equal(await readFile(target, "utf8"), edited.replace("qid: Q1163016", "qid: Q999"))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("dictionary catalog rejects duplicate identities and unrelated source hosts", () => {
  assert.throws(
    () =>
      validateCatalog({ ...catalog, entries: [...catalog.entries, catalog.entries[0]] }, subjects),
    /duplicate ID/,
  )
  const duplicate = structuredClone(catalog.entries[0])
  duplicate.id = "second-name"
  assert.throws(
    () => validateCatalog({ ...catalog, entries: [...catalog.entries, duplicate] }, subjects),
    /duplicate Wikidata/,
  )
  const bad = structuredClone(catalog)
  bad.entries[0].sources.zhWikipedia!.url = "https://example.org/wiki/张量积"
  assert.throws(() => validateCatalog(bad, subjects))
})

test("imported mathematical symbols remain literal text while frontmatter keeps searchable aliases", () => {
  const result = renderConcept(catalog.entries[0], catalog, subjects)
  assert.deepEqual(matter(result).data.concept.variants, catalog.entries[0].variants)
  const body = matter(result).content
  assert(body.includes("A &lt; B"))
  assert(body.includes("C\\*"))
  assert(body.includes("\\[not a link\\]\\(https://example\\.org\\)"))
  assert(body.includes("\\$x\\$"))
  assert(body.includes("oldid=2"))
})

test("concept presentation uses verified simplified titles while source identities stay intact", () => {
  const entry = structuredClone(catalog.entries[0])
  const before = structuredClone(entry.sources)
  const result = matter(renderConcept(entry, catalog, subjects))
  assert.equal(result.data.title, "张量积 / Tensor product")
  assert.equal(result.data.concept.zh, "张量积")
  assert(result.data.description.startsWith("张量积 —"))
  assert(result.data.concept.variants.includes("張量積"))
  assert(result.content.includes("**张量积**"))
  assert(
    result.content.includes("[中文 Wikipedia：张量积](<https://zh.wikipedia.org/wiki/張量積>)"),
  )
  assert(result.content.includes("oldid=4"))
  assert(result.content.includes("../dictionary#dictionary-sources"))
  assert(!result.content.includes("../dictionary-sources"))
  assert.deepEqual(entry.sources, before)
})

test("catalog validation requires a verified simplified primary title and retains original aliases", () => {
  const stale = structuredClone(catalog)
  stale.entries[0].zh = "張量積"
  assert.throws(() => validateCatalog(stale, subjects), /primary title must use zh-hans/)
  const unverified = structuredClone(catalog)
  delete unverified.entries[0].sources.zhWikipedia!.titleVariants
  assert.throws(() => validateCatalog(unverified, subjects), /missing verified Simplified Chinese/)
  const lostAlias = structuredClone(catalog)
  lostAlias.entries[0].variants = lostAlias.entries[0].variants.filter((name) => name !== "張量積")
  assert.throws(() => validateCatalog(lostAlias, subjects), /missing original Chinese title alias/)
})

function terminologyCatalog(): Catalog {
  const result = structuredClone(catalog)
  const entry = result.entries[0]
  delete entry.sources.zhWikipedia
  entry.wikipediaVerification = {
    verifiedOn: "2026-11-09",
    enQid: entry.qid,
    enPageId: entry.sources.enWikipedia.pageId,
    enRevisionId: entry.sources.enWikipedia.revisionId,
    zhSitelink: null,
  }
  entry.translation = {
    basis: "official-terminology",
    verifiedOn: "2026-11-10",
    sources: [
      {
        title: "示例中英术语表",
        url: "https://terms.example.org/record/tensor-product",
        publisher: "示例术语审定机构",
        sourceZh: "張量積",
        sourceEn: "tensor product",
        locator: "术语编号 T-012；第 3 页",
        kind: "terminology-record",
      },
    ],
    note: "采用简体字形，保留词表中的原译名。",
  }
  return result
}

test("concepts without Chinese Wikipedia require complete translation evidence", () => {
  const valid = terminologyCatalog()
  assert.doesNotThrow(() => validateCatalog(valid, subjects))
  const missing = structuredClone(valid)
  delete missing.entries[0].translation
  assert.throws(() => validateCatalog(missing, subjects), /missing Chinese translation evidence/)
  const empty = structuredClone(valid)
  empty.entries[0].translation!.sources = []
  assert.throws(() => validateCatalog(empty, subjects), /missing Chinese translation references/)
  const lostAlias = structuredClone(valid)
  lostAlias.entries[0].variants = []
  assert.throws(() => validateCatalog(lostAlias, subjects), /missing original translation alias/)
  const noEnglish = structuredClone(valid)
  Reflect.deleteProperty(noEnglish.entries[0].sources, "enWikipedia")
  assert.throws(() => validateCatalog(noEnglish, subjects), /missing English Wikipedia page/)
})

test("translation references validate real dates, required fields, and safe HTTPS URLs", () => {
  for (const date of ["2026-02-30", "2026-13-01", "2026-11-10T00:00:00Z", ""]) {
    const bad = terminologyCatalog()
    bad.entries[0].translation!.verifiedOn = date
    assert.throws(() => validateCatalog(bad, subjects), /translation verification date/)
  }
  for (const field of ["title", "url", "publisher", "sourceZh", "sourceEn"] as const) {
    const bad = terminologyCatalog()
    bad.entries[0].translation!.sources[0][field] = " "
    assert.throws(() => validateCatalog(bad, subjects), /missing translation reference/)
  }
  for (const url of [
    "javascript:alert(1)",
    "http://terms.example.org/record/1",
    "https://user:password@terms.example.org/record/1",
    "https://terms.example.org/record/1\n",
    "https://terms.example.org/record/<script>",
    "relative/record",
  ]) {
    const bad = terminologyCatalog()
    bad.entries[0].translation!.sources[0].url = url
    assert.throws(() => validateCatalog(bad, subjects), url)
  }
  for (const field of ["locator", "kind"] as const) {
    const bad = terminologyCatalog()
    bad.entries[0].translation!.sources[0][field] = " "
    assert.throws(() => validateCatalog(bad, subjects), /invalid translation reference/)
  }
  const unsupported = terminologyCatalog()
  Reflect.set(unsupported.entries[0].translation!, "basis", "wikidata-label")
  assert.throws(
    () => validateCatalog(unsupported, subjects),
    /unsupported Chinese translation basis/,
  )
})

test("English-only concepts require dated Wikipedia verification tied to the source identity", () => {
  const missing = terminologyCatalog()
  delete missing.entries[0].wikipediaVerification
  assert.throws(() => validateCatalog(missing, subjects), /missing Wikipedia verification/)
  for (const date of ["2026-02-30", "2026-13-01", "2026-11-10T00:00:00Z", ""]) {
    const bad = terminologyCatalog()
    bad.entries[0].wikipediaVerification!.verifiedOn = date
    assert.throws(() => validateCatalog(bad, subjects), /Wikipedia verification date/)
  }
  for (const [field, value, message] of [
    ["enQid", "Q999", /QID mismatch/],
    ["enPageId", 99, /page ID mismatch/],
    ["enRevisionId", 99, /revision ID mismatch/],
    ["zhSitelink", "张量积", /absent Chinese sitelink/],
    ["zhSitelink", undefined, /absent Chinese sitelink/],
  ] as const) {
    const bad = terminologyCatalog()
    Reflect.set(bad.entries[0].wikipediaVerification!, field, value)
    assert.throws(() => validateCatalog(bad, subjects), message)
  }
  assert.doesNotThrow(() => validateCatalog(catalog, subjects))
})

test("terminology references preserve source identities without inventing Chinese Wikipedia", () => {
  const data = terminologyCatalog()
  const entry = data.entries[0]
  const original = structuredClone(entry)
  const rendered = matter(renderConcept(entry, data, subjects))
  assert.equal(rendered.data.title, "张量积 / Tensor product")
  assert.equal(rendered.data.concept.zh, "张量积")
  assert.equal(rendered.data.dictionarySource.translationBasis, "official-terminology")
  assert.equal(rendered.data.dictionarySource.translationVerifiedOn, "2026-11-10")
  assert.equal(rendered.data.dictionarySource.wikipediaVerifiedOn, "2026-11-09")
  assert(rendered.data.concept.variants.includes("張量積"))
  assert(rendered.content.includes("## 中文译名依据 / Chinese translation references"))
  assert(rendered.content.includes("https://terms.example.org/record/tensor-product"))
  assert(rendered.content.includes("示例术语审定机构"))
  assert(rendered.content.includes("来源原译名：張量積；原文英文：tensor product"))
  assert(rendered.content.includes("采用简体名：**张量积**"))
  assert(rendered.content.includes("定位：术语编号 T-012；第 3 页"))
  assert(rendered.content.includes("核验时未找到对应的中文 Wikipedia 页面；采用术语来源译名"))
  assert(rendered.content.includes("2026-11-09 核验时未找到"))
  assert(rendered.content.includes("核验日期：2026-11-10"))
  assert(rendered.content.includes("采用简体字形，保留词表中的原译名"))
  assert(rendered.content.includes("https://en.wikipedia.org/wiki/Tensor_product"))
  assert(rendered.content.includes("oldid=2"))
  assert(rendered.content.includes("https://www.wikidata.org/wiki/Q1163016"))
  assert(rendered.content.includes("https://ncatlab.org/nlab/show/tensor+product"))
  assert(!rendered.content.includes("zh.wikipedia.org"))
  assert(!rendered.content.includes("[中文 Wikipedia"))
  assert.deepEqual(entry, original)
})

test("academic usage is described distinctly and reference text stays literal", () => {
  const data = terminologyCatalog()
  const translation = data.entries[0].translation!
  translation.basis = "academic-usage"
  translation.sources[0].title = "A < B and C* [paper]"
  translation.sources[0].locator = "公式 $x$；第 [2] 页"
  delete translation.note
  assert.doesNotThrow(() => validateCatalog(data, subjects))
  const rendered = matter(renderConcept(data.entries[0], data, subjects))
  assert.equal(rendered.data.dictionarySource.translationBasis, "academic-usage")
  assert(rendered.content.includes("采用学术文献用法"))
  assert(!rendered.content.includes("采用术语来源译名"))
  assert(rendered.content.includes("A &lt; B and C\\* \\[paper\\]"))
  assert(rendered.content.includes("公式 \\$x\\$；第 \\[2\\] 页"))
})

test("additional terminology evidence cannot bypass the established Chinese Wikipedia policy", () => {
  const data = terminologyCatalog()
  data.entries[0].sources.zhWikipedia = structuredClone(catalog.entries[0].sources.zhWikipedia)
  assert.doesNotThrow(() => validateCatalog(data, subjects))
  const rendered = matter(renderConcept(data.entries[0], data, subjects))
  assert.equal(rendered.data.dictionarySource.translationBasis, "wikipedia-same-wikidata-item")
  assert(rendered.content.includes("https://zh.wikipedia.org/wiki/張量積"))
  assert(!rendered.content.includes("核验时未找到"))
  data.entries[0].zh = "張量積"
  assert.throws(() => validateCatalog(data, subjects), /primary title must use zh-hans/)
})

test("terminology-backed imports preserve author edits on subsequent runs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dictionary-terminology-"))
  const data = terminologyCatalog()
  try {
    assert.deepEqual(await generateConcepts(root, data, subjects), { created: 1, preserved: 0 })
    const target = path.join(root, "content/concepts/tensor-product.md")
    const edited = (await readFile(target, "utf8")) + "\n自己的定义与例子。\n"
    await writeFile(target, edited)
    data.entries[0].translation!.note = "新一轮来源核对记录。"
    assert.deepEqual(await generateConcepts(root, data, subjects), { created: 0, preserved: 1 })
    assert.equal(await readFile(target, "utf8"), edited)
    await checkConcepts(root, data)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
