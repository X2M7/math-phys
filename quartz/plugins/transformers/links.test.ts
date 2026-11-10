import assert from "node:assert/strict"
import test from "node:test"
import { toHtml } from "hast-util-to-html"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { VFile } from "vfile"
import type { BuildCtx } from "../../util/ctx"
import type { FullSlug } from "../../util/path"
import { CrawlLinks } from "./links"

async function render(markdown: string) {
  const ctx = {
    allSlugs: ["concepts/tensor-product", "concepts/1-n-expansion", "notes/nested/topic"],
  } as BuildCtx
  const file = new VFile({ value: markdown })
  file.data.slug = "zh/algebra/index" as FullSlug
  const processor = unified().use(remarkParse).use(remarkRehype).use(CrawlLinks().htmlPlugins!(ctx))
  const html = toHtml(await processor.run(processor.parse(file), file))
  return { html, links: file.data.links }
}

test("pretty links preserve bilingual labels and slashes inside concept names", async () => {
  for (const label of [
    "张量积 / Tensor product",
    "Tensor product / 张量积",
    "1/N展开 / 1/N expansion",
  ]) {
    const { html, links } = await render(`[${label}](/concepts/tensor-product)`)
    assert(html.includes(`>${label}</a>`), html)
    assert.deepEqual(links, ["concepts/tensor-product"])
  }
})

test("unaliased paths can still be shortened without altering destinations or anchors", async () => {
  const { html, links } = await render(
    "[notes/nested/topic](notes/nested/topic) [#section](#section)",
  )
  assert.match(html, />topic<\/a>/)
  assert.match(html, /href="#section"[^>]*>#section<\/a>/)
  assert.deepEqual(links, ["notes/nested/topic"])
})
