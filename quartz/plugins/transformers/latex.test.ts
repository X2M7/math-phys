import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { toHtml } from "hast-util-to-html"
import katex from "katex"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { Latex } from "./latex"

async function render(markdown: string, options?: Parameters<typeof Latex>[0]): Promise<string> {
  const plugin = Latex(options)
  const processor = unified()
    .use(remarkParse)
    .use(plugin.markdownPlugins())
    .use(remarkRehype)
    .use(plugin.htmlPlugins())

  return toHtml(await processor.run(processor.parse(markdown)))
}

describe("KaTeX Markdown rendering", () => {
  test("renders inline math inside the surrounding paragraph", async () => {
    const html = await render("Before $x^2$ after.")

    assert.ok(html.startsWith('<p>Before <span class="katex">'))
    assert.ok(html.endsWith(" after.</p>"))
    assert.match(html, /class="katex-html"/)
    assert.doesNotMatch(html, /katex-display|katex-error|math-inline|<math/)
  })

  test("renders block math in display mode", async () => {
    const html = await render("$$\n\\frac{1}{2}\n$$")

    assert.ok(html.startsWith('<span class="katex-display"><span class="katex">'))
    assert.match(html, /class="mfrac"/)
    assert.doesNotMatch(html, /katex-error|language-math/)
  })

  test("passes custom macros to the renderer", async () => {
    assert.equal(
      await render("$\\RR$", { customMacros: { "\\RR": "\\mathbb{R}" } }),
      await render("$\\mathbb{R}$"),
    )
  })

  test("passes KaTeX layout options to the renderer", async () => {
    const html = await render("$$\nx = 1\n$$", { katexOptions: { fleqn: true } })

    assert.match(html, /class="katex-display fleqn"/)
    assert.doesNotMatch(html, /katex-error/)
  })

  test("does not trust dangerous URLs by default", async () => {
    for (const expression of ["\\href{javascript:alert(1)}{run}", "\\url{javascript:alert(1)}"]) {
      const html = await render(`$${expression}$`)

      assert.match(html, /class="katex"/)
      assert.doesNotMatch(html, /<a\b|\bhref=|\bsrc=|javascript:/i)
    }
  })

  test("loads CSS and copy support from the installed renderer version", () => {
    const resources = Latex().externalResources()

    assert.deepEqual(resources, {
      css: [{ content: `https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/katex.min.css` }],
      js: [
        {
          src: `https://cdn.jsdelivr.net/npm/katex@${katex.version}/dist/contrib/copy-tex.min.js`,
          loadTime: "afterDOMReady",
          contentType: "external",
        },
      ],
    })
    assert.equal(Latex({ renderEngine: "mathjax" }).externalResources(), undefined)
    assert.equal(Latex({ renderEngine: "typst" }).externalResources(), undefined)
  })
})
