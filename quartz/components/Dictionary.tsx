import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { collectDictionaryConcepts, normalizeDictionaryText } from "../util/dictionary"
import { resolveRelative } from "../util/path"
import style from "./styles/dictionary.scss"
// @ts-ignore
import script from "./scripts/dictionary.inline"

const Dictionary: QuartzComponent = ({ fileData, allFiles }: QuartzComponentProps) => {
  if (fileData.frontmatter?.pageType !== "dictionary") return null

  const concepts = collectDictionaryConcepts(allFiles)
  return (
    <section class="dictionary" aria-label="概念词典 / Concept dictionary">
      <div class="dictionary-search" role="search">
        <label for="dictionary-query">查找概念 / Find a concept</label>
        <div class="dictionary-search-field">
          <input
            id="dictionary-query"
            type="search"
            placeholder="中文、English 或别名"
            autoComplete="off"
            spellcheck={false}
            aria-controls="dictionary-list"
            aria-describedby="dictionary-count"
            disabled
          />
          <button type="button" class="dictionary-clear" hidden>
            清除 / Clear
          </button>
        </div>
      </div>
      <noscript>开启 JavaScript 后可筛选下方概念。 Enable JavaScript to filter the list.</noscript>
      <div class="dictionary-summary">
        <h2>全部概念 / All concepts</h2>
        <p id="dictionary-count" role="status" aria-live="polite" aria-atomic="true">
          {concepts.length} 个概念 / {concepts.length} concepts
        </p>
      </div>
      <ul id="dictionary-list" class="dictionary-list">
        {concepts.map((concept) => (
          <li
            id={`concept-${concept.id}`}
            data-dictionary-entry
            data-search={normalizeDictionaryText(
              [concept.zh, concept.en, ...concept.variants].join(" "),
            )}
          >
            <a
              class="internal dictionary-term"
              href={resolveRelative(fileData.slug!, concept.slug)}
            >
              <span lang="zh">{concept.zh}</span>
              <span lang="en">{concept.en}</span>
            </a>
            {concept.articles.length > 0 && (
              <details class="dictionary-articles">
                <summary>关联词条 / Articles ({concept.articles.length})</summary>
                <ul>
                  {concept.articles.map((article) => (
                    <li>
                      <a class="internal" href={resolveRelative(fileData.slug!, article.slug)}>
                        {article.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        ))}
      </ul>
      {concepts.length === 0 && (
        <div class="dictionary-empty">
          <p>尚未收录概念</p>
          <p lang="en">No concepts yet.</p>
        </div>
      )}
      <div class="dictionary-no-results dictionary-empty" hidden>
        <p>没有找到匹配的概念</p>
        <p lang="en">No matching concepts. Try another name or clear your search.</p>
      </div>
    </section>
  )
}

Dictionary.css = style
Dictionary.afterDOMLoaded = script
export default (() => Dictionary) satisfies QuartzComponentConstructor
