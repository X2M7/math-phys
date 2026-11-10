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
  bad.entries[0].sources.zhWikipedia.url = "https://example.org/wiki/张量积"
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
  delete unverified.entries[0].sources.zhWikipedia.titleVariants
  assert.throws(() => validateCatalog(unverified, subjects), /missing verified Simplified Chinese/)
  const lostAlias = structuredClone(catalog)
  lostAlias.entries[0].variants = lostAlias.entries[0].variants.filter((name) => name !== "張量積")
  assert.throws(() => validateCatalog(lostAlias, subjects), /missing original Chinese title alias/)
})
