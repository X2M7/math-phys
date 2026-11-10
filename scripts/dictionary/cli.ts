import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import path from "node:path"
import { Catalog, checkConcepts, generateConcepts, validateCatalog } from "./catalog"

const root = fileURLToPath(new URL("../../", import.meta.url))
const catalog = JSON.parse(
  await readFile(path.join(root, "data/dictionary/catalog.json"), "utf8"),
) as Catalog
const subjects = JSON.parse(
  await readFile(path.join(root, "data/dictionary/subjects.json"), "utf8"),
) as Record<string, string>
validateCatalog(catalog, subjects)
const command = process.argv[2]
if (command === "generate") {
  console.log(await generateConcepts(root, catalog, subjects))
} else if (command !== "check") {
  throw new Error("Usage: tsx scripts/dictionary/cli.ts <generate|check>")
}
await checkConcepts(root, catalog)
console.log(`Validated ${catalog.entries.length} bilingual concepts and their source identities.`)
