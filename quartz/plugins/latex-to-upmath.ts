import type { QuartzTransformerPlugin } from "./types"
import type { Image, Root } from "mdast"
import remarkMath from "remark-math"
import { visit } from "unist-util-visit"

const ENDPOINT = "https://tex.xumin.net/svg/"

function remarkUpmath() {
  return (tree: Root) => {
    visit(tree, ["inlineMath", "math"], (node, index, parent) => {
      if (
        !parent ||
        typeof index !== "number" ||
        (node.type !== "inlineMath" && node.type !== "math")
      ) {
        return
      }

      const rawLatex = node.value.trim()

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

      const img: Image = {
        type: "image",
        url,
        alt: latex,
        title: latex,
        data: {
          hProperties: {
            className:
              node.type === "math" ? ["upmath", "upmath-display"] : ["upmath", "upmath-inline"],
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

const LatexToUpmath = (() => ({
  name: "latex-to-upmath",
  markdownPlugins() {
    return [remarkMath, remarkUpmath]
  },
})) satisfies QuartzTransformerPlugin

export default LatexToUpmath
