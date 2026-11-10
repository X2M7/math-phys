import assert from "node:assert/strict"
import test from "node:test"
import { indexTree, treeUrl, type TreeNode } from "./tree"

function node(id: string, concepts: string[] = [], children: TreeNode[] = []): TreeNode {
  return {
    id,
    zh: "分类",
    en: "Branch",
    descriptionZh: "说明",
    descriptionEn: "Description",
    concepts,
    children,
  }
}

test("tree membership is many-to-many while category routes remain hierarchical", () => {
  const roots = [
    node("algebra", [], [node("algebra-linear", ["tensor-product"])]),
    node("physics", [], [node("physics-quantum", ["tensor-product", "quantum-state"])]),
  ]
  const result = indexTree(roots, new Set(["tensor-product", "quantum-state"]))
  assert.equal(result.length, 4)
  assert.equal(result[0].allConcepts.size, 1)
  assert.equal(result[2].allConcepts.size, 2)
  assert.equal(treeUrl(result[1], "zh"), "/zh/algebra/linear/")
  assert.equal(treeUrl(result[3], "en"), "/en/physics/quantum/")
  assert.deepEqual(
    result[1].ancestors.map((ancestor) => ancestor.id),
    ["algebra"],
  )
})

test("unclassified, invented and duplicate concept IDs fail instead of silently disappearing", () => {
  assert.throws(
    () => indexTree([node("a", ["known"])], new Set(["known", "missing"])),
    /Unclassified.*missing/,
  )
  assert.throws(
    () => indexTree([node("a", ["invented"])], new Set(["known"])),
    /unknown concept invented/,
  )
  assert.throws(
    () => indexTree([node("a", ["known", "known"])], new Set(["known"])),
    /duplicate concept known/,
  )
})

test("invalid routes and malformed historical references cannot be published", () => {
  assert.throws(
    () => indexTree([node("../escape", ["x"])], new Set(["x"])),
    /Invalid concept-tree ID/,
  )
  assert.throws(
    () => indexTree([node("a", [], [node("b", ["x"])])], new Set(["x"])),
    /child ID must start/,
  )
  assert.throws(
    () => indexTree([node("a", ["x"]), node("a", ["x"])], new Set(["x"])),
    /Duplicate concept-tree ID/,
  )
  assert.throws(
    () =>
      indexTree(
        [{ ...node("a", ["x"]), sources: [{ title: "Bad", url: "javascript:alert(1)" }] }],
        new Set(["x"]),
      ),
    /invalid historical reference/,
  )
})

test("history ordering is editorial, preserved independently of alphabetic labels", () => {
  const input = node(
    "analysis",
    [],
    [node("analysis-calculus", ["integral"]), node("analysis-foundations", ["limit"])],
  )
  const result = indexTree([input], new Set(["integral", "limit"]))
  assert.deepEqual(
    result.slice(1).map((entry) => [entry.node.id, entry.order]),
    [
      ["analysis-calculus", 0],
      ["analysis-foundations", 1],
    ],
  )
})
