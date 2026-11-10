import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { toHtml } from "hast-util-to-html"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import LatexToUpmath from "./latex-to-upmath"

async function render(markdown: string): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(LatexToUpmath().markdownPlugins())
    .use(remarkRehype)

  return toHtml(await processor.run(processor.parse(markdown)))
}

describe("LaTeX to Upmath Markdown rendering", () => {
  test("keeps inline formulas inside their surrounding paragraph", async () => {
    assert.equal(
      await render("Before $a + b$ after."),
      '<p>Before <img src="https://tex.xumin.net/svg/a%20%2B%20b" alt="a + b" title="a + b" class="upmath upmath-inline"> after.</p>',
    )
  })

  test("renders a display formula with its equation number outside the image", async () => {
    assert.equal(
      await render("$$\nx^2 \\tag{2.1}\n$$"),
      '<p class="upmath-block" data-eq="2.1"><img src="https://tex.xumin.net/svg/x%5E2" alt="x^2" title="x^2" class="upmath upmath-display"></p>',
    )
  })

  test("omits an equation number for an unnumbered display formula", async () => {
    assert.equal(
      await render("$$\nx^2\n$$"),
      '<p class="upmath-block"><img src="https://tex.xumin.net/svg/x%5E2" alt="x^2" title="x^2" class="upmath upmath-display"></p>',
    )
  })

  test("encodes LaTeX and Unicode as one URL path segment and escapes HTML attributes", async () => {
    const html = await render('$\\alpha & β < 50% #1 "quoted"$')

    assert.ok(
      html.includes(
        'src="https://tex.xumin.net/svg/%5Calpha%20%26%20%CE%B2%20%3C%2050%25%20%231%20%22quoted%22"',
      ),
    )
    assert.ok(html.includes('alt="\\alpha &#x26; β < 50% #1 &#x22;quoted&#x22;"'))
    assert.ok(!html.includes("%255C"))
  })

  test("leaves formulas inside Markdown code spans and fences unchanged", async () => {
    assert.equal(
      await render("`$x$`\n\n```tex\n$$y$$\n```"),
      '<p><code>$x$</code></p>\n<pre><code class="language-tex">$$y$$\n</code></pre>',
    )
  })
})
