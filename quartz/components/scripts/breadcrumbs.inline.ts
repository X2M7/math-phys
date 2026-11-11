import { selectConceptBreadcrumbTrail } from "../../util/conceptBreadcrumbs"

document.addEventListener("nav", () => {
  const breadcrumbs = document.querySelector<HTMLElement>(".breadcrumb-container")
  if (!breadcrumbs) return

  const trails = Array.from(
    breadcrumbs.querySelectorAll<HTMLOListElement>(".concept-breadcrumb-trail"),
  )
  if (trails.length) {
    const selected = selectConceptBreadcrumbTrail(
      trails.map((trail) => ({
        node: trail.dataset.treeNode!,
        lang: trail.lang === "en" ? "en" : "zh",
      })),
      new URLSearchParams(window.location.search),
    )
    trails.forEach((trail, index) => {
      trail.hidden = index !== selected
    })
    return
  }

  // Keep the selected branch in the URL for SPA navigation, new tabs and refreshes.
  // Attach it after Markdown processing, which treats query strings as slug text.
  const node = breadcrumbs.dataset.treeNode
  const lang = breadcrumbs.dataset.treeLang
  if (!node || (lang !== "zh" && lang !== "en")) return
  for (const link of document.querySelectorAll<HTMLAnchorElement>(
    "article.concept-tree-page a.internal",
  )) {
    const url = new URL(link.href)
    if (url.origin !== window.location.origin || !/\/concepts\/[^/]+\/?$/.test(url.pathname))
      continue
    url.searchParams.set("tree", node)
    url.searchParams.set("lang", lang)
    link.href = url.href
  }
})
