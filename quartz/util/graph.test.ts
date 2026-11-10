import assert from "node:assert/strict"
import test from "node:test"
import type { ContentDetails } from "../plugins/emitters/contentIndex"
import type { FilePath, FullSlug, SimpleSlug } from "./path"
import { getGraphData } from "./graph"

function page(slug: string, excludeFromGraph?: boolean): ContentDetails {
  return {
    slug: slug as FullSlug,
    filePath: `${slug}.md` as FilePath,
    title: slug,
    links: [],
    tags: [],
    content: "Searchable content",
    excludeFromGraph,
  }
}

test("graph exclusions preserve the full search index and keep ordinary article nodes", () => {
  const index = {
    "notes/tensors": page("notes/tensors"),
    "concepts/tensor-product": page("concepts/tensor-product", true),
    "dictionary-sources": page("dictionary-sources", true),
  }
  index["notes/tensors"].links = ["concepts/tensor-product" as SimpleSlug]
  const original = structuredClone(index)
  const graph = getGraphData(index)
  assert.deepEqual([...graph.keys()], ["notes/tensors"])
  assert.equal(graph.get("notes/tensors" as SimpleSlug)?.content, "Searchable content")
  assert.equal(graph.has("concepts/tensor-product" as SimpleSlug), false)
  assert.deepEqual(index, original)
  assert.equal(Object.keys(index).length, 3)
})

test("removing or clearing the exclusion restores a concept and folder slugs still simplify", () => {
  const concept = page("concepts/tensor-product", true)
  const index = { "concepts/tensor-product": concept, "notes/index": page("notes/index") }
  assert.deepEqual([...getGraphData(index).keys()], ["notes/"])
  concept.excludeFromGraph = false
  assert.deepEqual([...getGraphData(index).keys()], ["concepts/tensor-product", "notes/"])
  delete concept.excludeFromGraph
  assert.deepEqual([...getGraphData(index).keys()], ["concepts/tensor-product", "notes/"])
})
