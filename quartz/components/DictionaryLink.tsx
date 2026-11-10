import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { resolveRelative } from "../util/path"
import { classNames } from "../util/lang"

const DictionaryLink: QuartzComponent = ({
  fileData,
  allFiles,
  displayClass,
}: QuartzComponentProps) => {
  const dictionary = allFiles.find((file) => file.frontmatter?.pageType === "dictionary")
  if (!dictionary?.slug) return null
  return (
    <a
      class={classNames(displayClass, "dictionary-nav")}
      href={resolveRelative(fileData.slug!, dictionary.slug)}
      aria-current={fileData.slug === dictionary.slug ? "page" : undefined}
    >
      词典 <span lang="en">/ Dictionary</span>
    </a>
  )
}

DictionaryLink.css = `
.dictionary-nav { font-weight: 600; }
.dictionary-nav[aria-current="page"] { text-decoration: underline; text-underline-offset: 0.3em; }
`
export default (() => DictionaryLink) satisfies QuartzComponentConstructor
