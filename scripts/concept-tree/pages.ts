import matter from "gray-matter"
import yaml from "js-yaml"
import { format, type Options } from "prettier"

export const treeBlockStart = "<!-- concept-tree:start -->"
export const treeBlockEnd = "<!-- concept-tree:end -->"

export async function composeTreePage(
  current: string | undefined,
  metadata: Record<string, unknown>,
  generatedBody: string,
  config: Options = {},
): Promise<string> {
  const parsed = current ? matter(current) : { data: {}, content: "" }
  let before = ""
  let after = ""
  if (current) {
    const first = parsed.content.indexOf(treeBlockStart)
    const last = parsed.content.indexOf(treeBlockEnd)
    if (
      first === -1 ||
      last < first ||
      parsed.content.indexOf(treeBlockStart, first + treeBlockStart.length) !== -1 ||
      parsed.content.indexOf(treeBlockEnd, last + treeBlockEnd.length) !== -1
    ) {
      throw new Error("Refusing to replace content without one managed concept-tree block")
    }
    before = parsed.content.slice(0, first).trim()
    after = parsed.content.slice(last + treeBlockEnd.length).trim()
  }
  const content = [before, `${treeBlockStart}\n\n${generatedBody.trim()}\n\n${treeBlockEnd}`, after]
    .filter(Boolean)
    .join("\n\n")
  return format(
    `---\n${yaml.dump({ ...parsed.data, ...metadata }, { lineWidth: -1, noRefs: true, quotingType: '"' })}---\n\n${content}\n`,
    { ...config, parser: "markdown" },
  )
}
