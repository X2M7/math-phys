import assert from "node:assert/strict"
import test from "node:test"
import type { QuartzPluginData } from "../plugins/vfile"
import type { FullSlug } from "./path"
import { getConceptBreadcrumbTrails, selectConceptBreadcrumbTrail } from "./conceptBreadcrumbs"

function page(slug: string, frontmatter: Record<string, unknown>): QuartzPluginData {
  return { slug: slug as FullSlug, frontmatter: { title: slug, ...frontmatter } }
}

const concept = page("concepts/tensor-product", {
  title: "张量积 / Tensor product",
  concept: { id: "tensor-product", zh: "张量积", en: "Tensor product" },
})
const categories = [
  {
    node: "algebra-tensors",
    path: "algebra/tensors",
    zh: ["代数", "双线性型与张量"],
    en: ["Algebra", "Bilinear forms and tensors"],
    rootOrder: 1,
  },
  {
    node: "foundations-monoidal",
    path: "foundations/monoidal",
    zh: ["数学基础", "幺半与张量结构"],
    en: ["Foundations", "Monoidal and tensor structures"],
    rootOrder: 0,
  },
]
const files = [
  concept,
  ...(["zh", "en"] as const).flatMap((lang) => [
    page(`${lang}/index`, { title: lang === "zh" ? "数学物理 Wiki" : "Math-Phys Wiki" }),
    ...categories.flatMap((category) => [
      page(`${lang}/${category.path.split("/")[0]}/index`, { navOrder: category.rootOrder }),
      page(`${lang}/${category.path}/index`, {
        lang,
        navOrder: 0,
        treeNode: category.node,
        treePathZh: category.zh,
        treePathEn: category.en,
        treeConcepts: ["tensor-product"],
      }),
    ]),
  ]),
]

test("concept breadcrumbs follow real hierarchy, with a stable default in tree order", () => {
  const trails = getConceptBreadcrumbTrails(concept, files)
  assert.equal(trails.length, 4)
  assert.equal(trails[0].node, "foundations-monoidal")
  assert.equal(trails[0].lang, "zh")
  assert.deepEqual(trails[0].crumbs, [
    { displayName: "数学物理 Wiki", slug: "zh/index" },
    { displayName: "数学基础", slug: "zh/foundations/index" },
    { displayName: "幺半与张量结构", slug: "zh/foundations/monoidal/index" },
    { displayName: "张量积", slug: "concepts/tensor-product" },
  ])
  assert.deepEqual(
    trails[1].crumbs.map((crumb) => crumb.displayName),
    ["Math-Phys Wiki", "Foundations", "Monoidal and tensor structures", "Tensor product"],
  )
  assert.deepEqual(getConceptBreadcrumbTrails(concept, [...files].reverse()), trails)
})

test("URL context can select either language of an actual cross-classification only", () => {
  const trails = getConceptBreadcrumbTrails(concept, files)
  assert.equal(selectConceptBreadcrumbTrail(trails, new URLSearchParams()), 0)
  assert.equal(
    selectConceptBreadcrumbTrail(trails, new URLSearchParams("tree=algebra-tensors&lang=zh")),
    2,
  )
  assert.equal(
    selectConceptBreadcrumbTrail(trails, new URLSearchParams("tree=algebra-tensors&lang=en")),
    3,
  )
  for (const query of [
    "tree=physics",
    "tree=../../concepts/evil",
    "tree=<script>alert(1)</script>",
    "lang=en",
  ]) {
    assert.equal(selectConceptBreadcrumbTrail(trails, new URLSearchParams(query)), 0)
  }
})

test("ordinary pages and newly authored concepts without classification keep the standard fallback", () => {
  assert.deepEqual(getConceptBreadcrumbTrails(page("zh/index", {}), files), [])
  assert.deepEqual(getConceptBreadcrumbTrails(concept, [concept]), [])
})
