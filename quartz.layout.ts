import { PageLayout, SharedLayout } from "./quartz/cfg"
import * as Component from "./quartz/components"
import type { Options as ExplorerOptions } from "./quartz/components/Explorer"

const conceptExplorer: Partial<ExplorerOptions> = {
  filterFn: (node) => node.slugSegment !== "tags" && node.slug !== "concepts/index",
  sortFn: (a, b) => {
    const aOrder = a.data?.navOrder ?? Number.MAX_SAFE_INTEGER
    const bOrder = b.data?.navOrder ?? Number.MAX_SAFE_INTEGER
    if (aOrder !== bOrder) return aOrder - bOrder
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
    return a.displayName.localeCompare(b.displayName, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  },
}

// components shared across all pages
export const sharedPageComponents: SharedLayout = {
  head: Component.Head(),
  header: [],
  afterBody: [Component.Dictionary(), Component.ConceptLinks()],
  footer: Component.Footer({
    links: {},
  }),
}

// components for pages that display a single page (e.g. a single note)
export const defaultContentPageLayout: PageLayout = {
  beforeBody: [
    Component.ConditionalRender({
      component: Component.Breadcrumbs(),
      condition: (page) => page.fileData.slug !== "index",
    }),
    Component.ArticleTitle(),
    Component.ConditionalRender({
      component: Component.ContentMeta(),
      condition: (page) =>
        !["dictionary", "concept-tree"].includes(page.fileData.frontmatter?.pageType as string),
    }),
    Component.TagList(),
  ],
  left: [
    Component.PageTitle(),
    Component.DesktopOnly(Component.DictionaryLink()),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.LanguageToggle() },
        { Component: Component.ReaderMode() },
      ],
    }),
    Component.Explorer(conceptExplorer),
  ],
  right: [
    Component.ConditionalRender({
      component: Component.Graph(),
      condition: (page) =>
        page.fileData.frontmatter?.pageType !== "dictionary" &&
        page.fileData.frontmatter?.graph !== false,
    }),
    Component.ConditionalRender({
      component: Component.DesktopOnly(Component.TableOfContents()),
      condition: (page) => page.fileData.frontmatter?.pageType !== "dictionary",
    }),
    Component.ConditionalRender({
      component: Component.Backlinks(),
      condition: (page) =>
        !["dictionary", "concept-tree"].includes(page.fileData.frontmatter?.pageType as string),
    }),
  ],
}

// components for pages that display lists of pages  (e.g. tags or folders)
export const defaultListPageLayout: PageLayout = {
  beforeBody: [
    Component.Breadcrumbs(),
    Component.ArticleTitle(),
    Component.ConditionalRender({
      component: Component.ContentMeta(),
      condition: (page) => page.fileData.frontmatter?.pageType !== "concept-tree",
    }),
  ],
  left: [
    Component.PageTitle(),
    Component.DesktopOnly(Component.DictionaryLink()),
    Component.MobileOnly(Component.Spacer()),
    Component.Flex({
      components: [
        {
          Component: Component.Search(),
          grow: true,
        },
        { Component: Component.Darkmode() },
        { Component: Component.LanguageToggle() },
      ],
    }),
    Component.Explorer(conceptExplorer),
  ],
  right: [],
}
