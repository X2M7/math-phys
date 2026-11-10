import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { getDictionaryConcepts } from "../util/dictionary"
import { resolveRelative } from "../util/path"

const ConceptLinks: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  const fm = fileData.frontmatter
  if (fm?.concept === undefined && fm?.concepts === undefined) return null

  const concepts = getDictionaryConcepts(allFiles)
  const current = concepts.find((concept) => concept.slug === fileData.slug)
  const related = concepts.filter((concept) =>
    concept.articles.some((article) => article.slug === fileData.slug),
  )
  // Imported pages already include aliases in the searchable Markdown body.
  const showVariants = !fm?.dictionarySource && !!current?.variants.length
  if (!current?.articles.length && !showVariants && !related.length) return null

  return (
    <aside class="concept-links" aria-label="概念与词条 / Concepts and articles">
      {current && showVariants && <p>其他名称 / Also known as: {current.variants.join(" · ")}</p>}
      {related.length > 0 && (
        <section>
          <h2>相关概念 / Concepts</h2>
          <ul>
            {related.map((concept) => (
              <li>
                <a class="internal" href={resolveRelative(fileData.slug!, concept.slug)}>
                  <span lang="zh">{concept.zh}</span> · <span lang="en">{concept.en}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {current && current.articles.length > 0 && (
        <section>
          <h2>关联词条 / Articles</h2>
          <ul>
            {current.articles.map((article) => (
              <li>
                <a class="internal" href={resolveRelative(fileData.slug!, article.slug)}>
                  {article.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}

ConceptLinks.css = `
.concept-links { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--lightgray); }
.concept-links h2 { font-size: 1.1rem; }
`
export default (() => ConceptLinks) satisfies QuartzComponentConstructor
