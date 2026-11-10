import assert from "node:assert/strict"
import test from "node:test"
import type { QuartzPluginData } from "../plugins/vfile"
import type { FullSlug } from "./path"
import { collectConceptPlacements, getConceptPlacements } from "./conceptTree"
import { getDictionaryConcepts } from "./dictionary"

const concept = (): QuartzPluginData => ({
  slug: "concepts/tensor-product" as FullSlug,
  frontmatter: {
    title: "张量积",
    concept: { id: "tensor-product", zh: "张量积", en: "Tensor product" },
  },
})
function category(node: string, lang: "zh" | "en", members = ["tensor-product"]): QuartzPluginData {
  return {
    slug: `${lang}/${node}/index` as FullSlug,
    frontmatter: {
      title: node,
      treeNode: node,
      lang,
      treeConcepts: members,
      treePathZh: ["代数", "张量"],
      treePathEn: ["Algebra", "Tensors"],
    },
  }
}

test("one concept links back to each bilingual category without treating them as author articles", () => {
  const files = [
    concept(),
    category("algebra", "zh"),
    category("algebra", "en"),
    category("physics", "zh"),
    category("physics", "en"),
  ]
  const result = collectConceptPlacements(files).get("tensor-product")!
  assert.equal(result.length, 2)
  assert.equal(result[0].en, "en/algebra/index")
  assert.deepEqual(result[0].pathZh, ["代数", "张量"])
  assert.deepEqual(getDictionaryConcepts(files)[0].articles, [])
  assert.equal(getConceptPlacements(files), getConceptPlacements(files))
  assert.notEqual(getConceptPlacements([...files]), getConceptPlacements(files))
})

test("missing translations and stale concept membership are identified at build time", () => {
  assert.throws(
    () => collectConceptPlacements([concept(), category("algebra", "en")]),
    /missing Chinese/,
  )
  assert.throws(
    () => collectConceptPlacements([concept(), category("algebra", "zh")]),
    /missing English/,
  )
  assert.throws(
    () => collectConceptPlacements([concept(), category("algebra", "zh", ["missing"])]),
    /unknown concept-tree member/,
  )
  assert.throws(
    () =>
      collectConceptPlacements([
        concept(),
        category("algebra", "zh"),
        category("algebra", "en", []),
      ]),
    /bilingual.*differs/,
  )
  assert.throws(
    () =>
      collectConceptPlacements([concept(), category("algebra", "zh"), category("algebra", "zh")]),
    /Duplicate concept-tree/,
  )
  assert.equal(collectConceptPlacements([]).size, 0)
})

test("the two language pages must describe the same hierarchy", () => {
  const english = category("algebra", "en")
  english.frontmatter!.treePathEn = ["Wrong branch"]
  assert.throws(
    () => collectConceptPlacements([concept(), category("algebra", "zh"), english]),
    /treePathEn differs/,
  )
})
