import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import matter from "gray-matter"
import { resolveConfig } from "prettier"
import { slugifyFilePath, type FilePath } from "../../quartz/util/path"
import { indexTree, readTree, treeUrl, type TreeEntry } from "./tree"
import { composeTreePage } from "./pages"

const root = fileURLToPath(new URL("../../", import.meta.url))
const command = process.argv[2]
if (command !== "generate" && command !== "check") {
  throw new Error("Usage: tsx scripts/concept-tree/cli.ts <generate|check>")
}
const concepts = new Map<string, { id: string; zh: string; en: string; url: string }>()
const conceptDirectory = path.join(root, "content/concepts")
for (const relative of await readdir(conceptDirectory, { recursive: true })) {
  if (!relative.endsWith(".md")) continue
  const file = path.join(conceptDirectory, relative)
  const { concept } = matter(await readFile(file, "utf8")).data
  if (!concept) continue
  if (
    typeof concept.id !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(concept.id) ||
    typeof concept.zh !== "string" ||
    !concept.zh.trim() ||
    typeof concept.en !== "string" ||
    !concept.en.trim()
  ) {
    throw new Error(`${file}: invalid concept ID or bilingual titles`)
  }
  if (concepts.has(concept.id)) throw new Error(`${file}: duplicate concept ID ${concept.id}`)
  const slug = slugifyFilePath(`concepts/${relative.replaceAll(path.sep, "/")}` as FilePath)
  concepts.set(concept.id, { id: concept.id, zh: concept.zh, en: concept.en, url: `/${slug}` })
}
const roots = await readTree(root)
const entries = indexTree(roots, new Set(concepts.keys()))
const byId = new Map(entries.map((entry) => [entry.node.id, entry]))
const foundations = roots.find((node) => node.id === "foundations_of_mathematics")!
if (foundations.children.map((child) => child.zh).join("、") !== "集合论、数理逻辑、范畴论") {
  throw new Error("数学基础必须且只包含集合论、数理逻辑、范畴论三个分支")
}
const config = (await resolveConfig(path.join(root, "content/index.md"))) ?? {}
const generated = new Set<string>()
const md = (text: string) => text.replace(/[\\`*_\[\]<>]/g, "\\$&")
const count = (entry: TreeEntry, lang: "zh" | "en") =>
  lang === "zh" ? `${entry.allConcepts.size} 个概念` : `${entry.allConcepts.size} concepts`
const historyNote = {
  zh: "各分支按研究方向的历史形成与后续发展分层排列。年代说明的是方向的形成时期，并非组内每个术语的首次出现年份；同一时期的概念兼顾先修关系。交叉概念在多个分支中列出，均指向同一个词条。",
  en: "Branches follow the historical formation and subsequent development of each subject. Periods describe the emergence of a research direction, not the first appearance of every term in it; concepts within a stage also take prerequisites into account. Interdisciplinary concepts appear in several branches, all linking to the same entry.",
}

function link(entry: TreeEntry, lang: "zh" | "en") {
  return `[${md(entry.node[lang])}](${treeUrl(entry, lang)})`
}

function branchOutline(entry: TreeEntry, lang: "zh" | "en", depth = 0): string[] {
  const period = lang === "zh" ? entry.node.periodZh : entry.node.periodEn
  const line = `${"  ".repeat(depth)}- ${link(entry, lang)}${period ? ` · ${md(period)}` : ""} · ${count(entry, lang)}`
  return [
    line,
    ...entry.node.children.flatMap((child) => branchOutline(byId.get(child.id)!, lang, depth + 1)),
  ]
}

function body(entry: TreeEntry, lang: "zh" | "en") {
  const { node, ancestors } = entry
  const trail = [
    `[${lang === "zh" ? "数学物理 Wiki" : "Math-Phys Wiki"}](/${lang}/)`,
    ...ancestors.map((ancestor) => link(byId.get(ancestor.id)!, lang)),
  ].join(" → ")
  const lines = [trail, "", lang === "zh" ? node.descriptionZh : node.descriptionEn, ""]
  const period = lang === "zh" ? node.periodZh : node.periodEn
  if (period)
    lines.push(
      lang === "zh" ? `**发展阶段**：${md(period)}` : `**Historical development:** ${md(period)}`,
      "",
    )
  lines.push(
    lang === "zh"
      ? `本分支及下级分类收录 **${count(entry, lang)}**。`
      : `This branch and its subdivisions contain **${count(entry, lang)}**.`,
    "",
  )
  if (node.children.length) {
    lines.push(
      `## ${lang === "zh" ? "概念树与发展脉络" : "Concept tree and development"}`,
      "",
      historyNote[lang],
      "",
    )
    lines.push(...node.children.flatMap((child) => branchOutline(byId.get(child.id)!, lang)), "")
  }
  if (node.concepts.length) {
    lines.push(
      `## ${lang === "zh" ? (node.children.length ? "本层概念" : "概念词条") : node.children.length ? "Concepts at this level" : "Concept entries"}`,
      "",
    )
    for (const id of node.concepts) {
      const concept = concepts.get(id)!
      const title =
        lang === "zh" ? `${concept.zh} / ${concept.en}` : `${concept.en} / ${concept.zh}`
      lines.push(`- [${md(title)}](${concept.url})`)
    }
    lines.push("")
  }
  if (node.sources?.length) {
    lines.push(
      `## ${lang === "zh" ? "分支与历史参考" : "References for the subject and its history"}`,
      "",
    )
    for (const source of node.sources) lines.push(`- [${md(source.title)}](${source.url})`)
    lines.push("")
  }
  if (!node.children.length) lines.push(`> ${historyNote[lang]}`, "")
  return lines.join("\n")
}

async function readOptional(file: string) {
  try {
    return await readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return undefined
  }
}

async function syncPage(
  relative: string,
  metadata: Record<string, unknown>,
  generatedBody: string,
) {
  const file = path.join(root, relative)
  generated.add(relative)
  const current = await readOptional(file)
  const desired = await composeTreePage(current, metadata, generatedBody, config).catch((error) => {
    throw new Error(`${relative}: ${error.message}`)
  })
  if (command === "generate") {
    if (current !== desired) {
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, desired)
    }
  } else if (current !== desired) {
    throw new Error(`${relative}: missing or stale concept tree; run npm run tree:generate`)
  }
}

for (const lang of ["zh", "en"] as const) {
  for (const entry of entries) {
    const trail = [...entry.ancestors, entry.node]
    await syncPage(
      `content${treeUrl(entry, lang)}index.md`,
      {
        title: entry.node[lang],
        description: lang === "zh" ? entry.node.descriptionZh : entry.node.descriptionEn,
        lang,
        alt: treeUrl(entry, lang === "zh" ? "en" : "zh"),
        pageType: "concept-tree",
        cssclasses: ["concept-tree-page"],
        graph: false,
        socialImage: "og-image.png",
        navOrder: entry.order,
        treeNode: entry.node.id,
        treePathZh: trail.map((node) => node.zh),
        treePathEn: trail.map((node) => node.en),
        treeConcepts: entry.node.concepts,
      },
      body(entry, lang),
    )
  }
  const lines = [
    lang === "zh" ? "欢迎来到数学物理 Wiki。" : "Welcome to the mathematics and physics Wiki.",
    "",
    `## ${lang === "zh" ? "目录" : "Contents"}`,
    "",
    lang === "zh"
      ? `按概念树浏览 **${concepts.size} 个中英文概念**。`
      : `Browse **${concepts.size} bilingual concepts** through the concept tree.`,
    "",
    historyNote[lang],
    "",
  ]
  for (const node of roots) {
    const entry = byId.get(node.id)!
    lines.push(`- ${link(entry, lang)} · ${count(entry, lang)}`)
    if (node.id === "foundations_of_mathematics") {
      for (const child of node.children) lines.push(`  - ${link(byId.get(child.id)!, lang)}`)
    }
  }
  await syncPage(
    `content/${lang}/index.md`,
    {
      title: lang === "zh" ? "数学物理 Wiki" : "Math-Phys Wiki",
      lang,
      alt: `/${lang === "zh" ? "en" : "zh"}/`,
      pageType: "concept-tree",
      cssclasses: ["concept-tree-page"],
      graph: false,
      socialImage: "og-image.png",
    },
    lines.join("\n"),
  )
}

// A renamed/removed category must not leave an old generated route serving stale assignments.
for (const lang of ["zh", "en"]) {
  const base = path.join(root, "content", lang)
  for (const relative of await readdir(base, { recursive: true })) {
    if (!relative.endsWith(".md")) continue
    const file = `content/${lang}/${relative.replaceAll(path.sep, "/")}`
    if (generated.has(file)) continue
    const current = await readFile(path.join(base, relative), "utf8")
    if (matter(current).data.pageType === "concept-tree") {
      throw new Error(
        `${file}: stale generated route; preserve any author notes before removing it`,
      )
    }
  }
}
const placements = entries.reduce((sum, entry) => sum + entry.node.concepts.length, 0)
console.log(
  `Validated ${concepts.size} concepts, ${entries.length} branches, ${placements} placements and ${generated.size} bilingual pages.`,
)
