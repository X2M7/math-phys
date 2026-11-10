import assert from "node:assert/strict"
import test, { describe } from "node:test"
import type { QuartzPluginData } from "../plugins/vfile"
import type { FullSlug } from "./path"
import {
  collectDictionaryConcepts,
  matchesDictionaryQuery,
  normalizeDictionaryText,
} from "./dictionary"

function page(slug: string, frontmatter: Record<string, unknown> = {}): QuartzPluginData {
  return { slug: slug as FullSlug, frontmatter: { title: slug, ...frontmatter } }
}

function concept(slug: string, id: string, zh: string, en: string): QuartzPluginData {
  return page(slug, { concept: { id, zh, en } })
}

describe("dictionary records", () => {
  test("an empty collection and ordinary pages produce an empty dictionary", () => {
    assert.deepEqual(collectDictionaryConcepts([]), [])
    assert.deepEqual(collectDictionaryConcepts([page("index"), { slug: "notes" as FullSlug }]), [])
  })

  test("stable IDs connect bilingual records to articles independently of file names and titles", () => {
    const records = collectDictionaryConcepts([
      page("notes/tensors-II", {
        title: "张量积 II",
        concepts: ["tensor-product", "dual-space", "tensor-product"],
      }),
      concept("concepts/张量积", "tensor-product", "张量积", "Tensor product"),
      concept("concepts/对偶空间", "dual-space", "对偶空间", "Dual space"),
    ])

    assert.deepEqual(
      records.map(({ id, zh, en, slug }) => ({ id, zh, en, slug })),
      [
        { id: "dual-space", zh: "对偶空间", en: "Dual space", slug: "concepts/对偶空间" },
        { id: "tensor-product", zh: "张量积", en: "Tensor product", slug: "concepts/张量积" },
      ],
    )
    for (const record of records) {
      assert.deepEqual(record.articles, [{ title: "张量积 II", slug: "notes/tensors-II" }])
      assert.deepEqual(record.variants, [])
    }
  })

  test("concept pages can reference other concepts without listing themselves as related articles", () => {
    const records = collectDictionaryConcepts([
      page("concepts/tensor", {
        title: "Tensor product",
        concept: { id: "tensor-product", zh: "张量积", en: "Tensor product" },
        concepts: ["tensor-product", "dual-space"],
      }),
      concept("concepts/dual", "dual-space", "对偶空间", "Dual space"),
    ])
    assert.deepEqual(records[0].articles, [{ title: "Tensor product", slug: "concepts/tensor" }])
    assert.deepEqual(records[1].articles, [])
  })

  test("variants remain searchable labels without changing the target page", () => {
    const source = page("concepts/linear-map", {
      concept: {
        id: "linear-map",
        zh: " 线性映射 ",
        en: " Linear map ",
        variants: ["线性变换", "Linear transformation", "线性变换"],
      },
    })
    const original = structuredClone(source)
    const [record] = collectDictionaryConcepts([source])
    assert.equal(record.slug, "concepts/linear-map")
    assert.equal(record.zh, "线性映射")
    assert.equal(record.en, "Linear map")
    assert.deepEqual(record.variants, ["线性变换", "Linear transformation"])
    assert.deepEqual(source, original)
  })

  test("duplicate IDs identify both conflicting pages", () => {
    assert.throws(
      () =>
        collectDictionaryConcepts([
          concept("concepts/first", "tensor-product", "张量积", "Tensor product"),
          concept("concepts/second", "tensor-product", "张量乘积", "Tensor product"),
        ]),
      /concepts\/second.*duplicate concept\.id "tensor-product".*concepts\/first/,
    )
  })

  test("invalid concept metadata identifies the source and the field to fix", () => {
    const valid = { id: "tensor-product", zh: "张量积", en: "Tensor product" }
    const invalid: [unknown, RegExp][] = [
      [null, /concept must be an object/],
      ["tensor-product", /concept must be an object/],
      [[], /concept must be an object/],
      [{ ...valid, id: "Tensor Product" }, /concept\.id.*kebab-case/],
      [{ ...valid, id: "tensor--product" }, /concept\.id.*kebab-case/],
      [{ ...valid, zh: " " }, /concept\.zh.*non-empty string/],
      [{ ...valid, en: 123 }, /concept\.en.*non-empty string/],
      [{ ...valid, variants: "张量乘积" }, /concept\.variants.*list/],
      [{ ...valid, variants: [null] }, /concept\.variants.*non-empty string/],
    ]
    for (const [value, detail] of invalid) {
      assert.throws(
        () => collectDictionaryConcepts([page("concepts/broken", { concept: value })]),
        (error: unknown) =>
          error instanceof Error &&
          error.message.includes("concepts/broken") &&
          detail.test(error.message),
      )
    }
  })

  test("broken article references fail with the article and unknown ID", () => {
    assert.throws(
      () => collectDictionaryConcepts([page("notes/article", { concepts: ["missing-concept"] })]),
      /notes\/article.*unknown concept ID "missing-concept"/,
    )
    assert.throws(
      () => collectDictionaryConcepts([page("notes/article", { concepts: "tensor-product" })]),
      /notes\/article.*concepts must be a list/,
    )
    assert.throws(
      () => collectDictionaryConcepts([page("notes/article", { concepts: [42] })]),
      /notes\/article.*concepts entries.*kebab-case/,
    )
  })

  test("a concept without a usable page slug cannot create a broken link", () => {
    assert.throws(
      () => collectDictionaryConcepts([concept("", "tensor-product", "张量积", "Tensor product")]),
      /valid page slug is required/,
    )
  })
})

describe("dictionary filtering", () => {
  const searchable = "张量积 Tensor product 张量乘积 Tensor-product"

  test("empty search shows all concepts; Chinese, English, and variant queries find the same record", () => {
    for (const query of ["", " \t\n", "张量积", "TENSOR PRODUCT", "张量乘积", "tensor-product"]) {
      assert.equal(matchesDictionaryQuery(searchable, query), true, query)
    }
  })

  test("all query terms must match, including terms from different language fields", () => {
    assert.equal(matchesDictionaryQuery(searchable, "张量积 product"), true)
    assert.equal(matchesDictionaryQuery(searchable, "product 张量乘积"), true)
    assert.equal(matchesDictionaryQuery(searchable, "tensor dual"), false)
  })

  test("full-width text, spacing, and typographic dashes do not prevent a match", () => {
    assert.equal(matchesDictionaryQuery("Self-adjoint 自伴", "ＳＥＬＦ—ＡＤＪＯＩＮＴ"), true)
    assert.equal(matchesDictionaryQuery("Tensor\u00a0product", "  tensor\n product "), true)
    assert.equal(normalizeDictionaryText(" Ｓｅｌｆ–ＡＤＪＯＩＮＴ\t 自伴 "), "self adjoint 自伴")
  })
})
