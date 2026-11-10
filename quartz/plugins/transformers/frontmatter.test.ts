import assert from "node:assert/strict"
import { describe, test } from "node:test"
import type { Root } from "mdast"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { VFile } from "vfile"
import type { BuildCtx } from "../../util/ctx"
import type { FullSlug } from "../../util/path"
import { FrontMatter, type Options } from "./frontmatter"

async function parseFrontmatter(
  markdown: string,
  options?: Partial<Options>,
  path = "notes/Test.md",
) {
  const allSlugs: FullSlug[] = ["notes/Test" as FullSlug]
  const ctx = {
    cfg: { configuration: { locale: "en-US" } },
    allSlugs,
  } as BuildCtx
  const file = new VFile({ value: markdown, path })
  const processor = unified().use(remarkParse).use(FrontMatter(options).markdownPlugins!(ctx))
  const tree = (await processor.run(processor.parse(file), file)) as Root

  assert.ok(file.data.frontmatter)
  return { frontmatter: file.data.frontmatter, aliases: file.data.aliases, allSlugs, tree }
}

describe("FrontMatter parser compatibility", () => {
  test("normalizes YAML tags and aliases while preserving date strings", async () => {
    const { frontmatter, aliases, allSlugs, tree } = await parseFrontmatter(`---
title: Tensor Products
tags: [Linear Algebra, Linear Algebra, math/tensor products, 2026]
aliases: [Tensor Product, notes/Test.md]
date: 2026-11-10
updated: 2026-11-11T12:30:00Z
---
Body.
`)

    assert.equal(frontmatter.title, "Tensor Products")
    assert.deepEqual(frontmatter.tags, ["Linear-Algebra", "math/tensor-products", "2026"])
    assert.deepEqual(frontmatter.aliases, ["Tensor Product", "notes/Test.md"])
    assert.deepEqual(aliases, ["Tensor-Product", "notes/Test"])
    assert.deepEqual(allSlugs, ["notes/Test", "Tensor-Product"])
    assert.equal(frontmatter.created, "2026-11-10")
    assert.equal(frontmatter.modified, "2026-11-11T12:30:00Z")
    assert.equal(frontmatter.published, "2026-11-10")
    assert.deepEqual(
      tree.children.map((node) => node.type),
      ["yaml", "paragraph"],
    )
  })

  test("accepts singular YAML aliases and comma-separated values", async () => {
    const { frontmatter, aliases } = await parseFrontmatter(`---
title: 2026
tag: math, tensor products, math
alias: Tensor Product, Algebra/Index.md
created: 2026-11-10
---
`)

    assert.equal(frontmatter.title, "2026")
    assert.deepEqual(frontmatter.tags, ["math", "tensor-products"])
    assert.deepEqual(frontmatter.aliases, ["Tensor Product", "Algebra/Index.md"])
    assert.deepEqual(aliases, ["Tensor-Product", "Algebra/Index"])
    assert.equal(frontmatter.modified, "2026-11-10")
  })

  test("uses the filename when the title is absent, null, or empty", async () => {
    for (const markdown of ["Body.", "---\ntitle: null\n---\n", '---\ntitle: ""\n---\n']) {
      const { frontmatter } = await parseFrontmatter(markdown)
      assert.equal(frontmatter.title, "Test")
    }
  })

  test("parses TOML with custom delimiters and preserves table data", async () => {
    const { frontmatter, aliases, allSlugs, tree } = await parseFrontmatter(
      `+++
title = "Tensor Products"
tags = ["Linear Algebra", "Linear Algebra", "math/tensor products"]
alias = ["Tensor Product", "notes/Test.md"]
date = 2026-11-10
[metadata]
chapter = 2
subject = "Mathematics"
+++
Body.
`,
      { language: "toml", delimiters: "+++" },
    )

    assert.equal(frontmatter.title, "Tensor Products")
    assert.deepEqual(frontmatter.tags, ["Linear-Algebra", "math/tensor-products"])
    assert.deepEqual(frontmatter.aliases, ["Tensor Product", "notes/Test.md"])
    assert.deepEqual(aliases, ["Tensor-Product", "notes/Test"])
    assert.deepEqual(allSlugs, ["notes/Test", "Tensor-Product"])
    assert.equal(frontmatter.created, "2026-11-10")
    assert.equal(frontmatter.modified, "2026-11-10")
    assert.equal(frontmatter.published, "2026-11-10")
    assert.deepEqual(
      { ...(frontmatter.metadata as Record<string, unknown>) },
      { chapter: 2, subject: "Mathematics" },
    )
    assert.deepEqual(
      tree.children.map((node) => node.type),
      ["toml", "paragraph"],
    )
  })

  test("honors the TOML language option with the default delimiters", async () => {
    const { frontmatter } = await parseFrontmatter(
      `---
title = 2026
tag = "math, tensor products, math"
alias = "Tensor Product, Algebra/Index.md"
---
`,
      { language: "toml" },
    )

    assert.equal(frontmatter.title, "2026")
    assert.deepEqual(frontmatter.tags, ["math", "tensor-products"])
    assert.deepEqual(frontmatter.aliases, ["Tensor Product", "Algebra/Index.md"])
  })

  test("preserves TOML offset dates and local date-time strings", async () => {
    const { frontmatter } = await parseFrontmatter(
      `+++
date = 2026-11-10T08:00:00+08:00
lastmod = 2026-11-11T12:30:00
publishDate = 2026-11-12T09:00:00Z
+++
`,
      { language: "toml", delimiters: "+++" },
    )

    assert.equal(frontmatter.title, "Test")
    assert.deepEqual(frontmatter.created, new Date("2026-11-10T00:00:00Z"))
    assert.equal(frontmatter.modified, "2026-11-11T12:30:00")
    assert.deepEqual(frontmatter.published, new Date("2026-11-12T09:00:00Z"))
  })
})
