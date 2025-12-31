import type { QuartzTransformerPlugin } from "./types"
import remarkMath from "remark-math"
import { visit } from "unist-util-visit"

const ENDPOINT = "https://xumin.net/svg/"

function remarkUpmath() {
  return (tree: any) => {
    visit(tree, ["inlineMath", "math"], (node: any, index: number, parent: any) => {
      if (!parent || typeof index !== "number") return

      const rawLatex = (node.value ?? "").trim()

      // 只对块公式提取 \tag{...}
      let tag: string | undefined
      let latex = rawLatex
      if (node.type === "math") {
        const m = rawLatex.match(/\\tag\{([^}]*)\}/)
        if (m) {
          tag = m[1]
          latex = rawLatex.replace(/\\tag\{[^}]*\}/g, "").trim()
        }
      }

      const url = `${ENDPOINT}${encodeURIComponent(latex)}`

      const img: any = {
        type: "image",
        url,
        alt: latex,
        title: latex,
        data: {
          hProperties: {
            className: node.type === "math" ? ["upmath", "upmath-display"] : ["upmath", "upmath-inline"],
          },
        },
      }

      if (node.type === "math") {
        parent.children[index] = {
          type: "paragraph",
          data: {
            hProperties: {
              className: ["upmath-block"],
              ...(tag ? { "data-eq": tag } : {}), // 有 tag 才加
            },
          },
          children: [img],
        }
      } else {
        parent.children[index] = img
      }
    })
  }
}

const LatexToUpmath: QuartzTransformerPlugin = () => ({
  name: "latex-to-upmath",
  markdownPlugins() {
    return [remarkMath, remarkUpmath]
  },
})

export default LatexToUpmath
