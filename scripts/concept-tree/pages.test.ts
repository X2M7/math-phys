import assert from "node:assert/strict"
import test from "node:test"
import matter from "gray-matter"
import { composeTreePage, treeBlockStart, treeBlockEnd } from "./pages"

test("regeneration preserves author prose, math and additional metadata outside the managed block", async () => {
  const original = `---\ntitle: Old name\nauthor: Original author\n---\n\n我的导读。\n\n${treeBlockStart}\n\nOld tree\n\n${treeBlockEnd}\n\n## 自写内容\n\n$$x^2 + y^2 = 1$$\n`
  const result = await composeTreePage(
    original,
    { title: "集合论", treeConcepts: ["set-theory"] },
    "- New tree",
  )
  const parsed = matter(result)
  assert.equal(parsed.data.title, "集合论")
  assert.equal(parsed.data.author, "Original author")
  assert.match(parsed.content, /我的导读。/)
  assert.match(parsed.content, /自写内容/)
  assert.match(parsed.content, /x\^2 \+ y\^2 = 1/)
  assert.match(parsed.content, /- New tree/)
  assert.doesNotMatch(parsed.content, /Old tree/)
  assert.equal(
    await composeTreePage(result, { title: "集合论", treeConcepts: ["set-theory"] }, "- New tree"),
    result,
  )
})

test("existing author pages and ambiguous management markers are never replaced", async () => {
  for (const current of [
    "---\ntitle: Author page\n---\n\nOriginal content",
    `${treeBlockStart}\nNew text`,
    `${treeBlockStart}\n${treeBlockEnd}\n${treeBlockEnd}`,
    `${treeBlockStart}\n${treeBlockStart}\n${treeBlockEnd}`,
  ]) {
    await assert.rejects(
      composeTreePage(current, { title: "New" }, "replacement"),
      /Refusing to replace/,
    )
  }
})
