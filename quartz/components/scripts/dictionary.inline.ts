import { matchesDictionaryQuery } from "../../util/dictionary"

document.addEventListener("nav", () => {
  const dictionary = document.querySelector<HTMLElement>(".dictionary")
  if (!dictionary) return

  const input = dictionary.querySelector<HTMLInputElement>("#dictionary-query")!
  const clear = dictionary.querySelector<HTMLButtonElement>(".dictionary-clear")!
  const count = dictionary.querySelector<HTMLElement>("#dictionary-count")!
  const noResults = dictionary.querySelector<HTMLElement>(".dictionary-no-results")!
  const heading = dictionary.querySelector<HTMLElement>(".dictionary-summary h2")!
  const entries = [...dictionary.querySelectorAll<HTMLElement>("[data-dictionary-entry]")]

  const update = () => {
    let visible = 0
    for (const entry of entries) {
      const matches = matchesDictionaryQuery(entry.dataset.search ?? "", input.value)
      entry.hidden = !matches
      if (matches) visible++
    }
    const filtering = input.value.trim().length > 0
    heading.textContent = filtering ? "搜索结果 / Search results" : "全部概念 / All concepts"
    count.textContent = filtering
      ? `${visible} / ${entries.length} 个概念 · ${visible} of ${entries.length} concepts`
      : `${entries.length} 个概念 / ${entries.length} concepts`
    clear.hidden = input.value.length === 0
    noResults.hidden = entries.length === 0 || visible !== 0
  }

  const reset = () => {
    input.value = ""
    update()
    input.focus()
  }
  const keydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault()
      reset()
    }
  }

  input.disabled = entries.length === 0
  update()
  input.addEventListener("input", update)
  input.addEventListener("keydown", keydown)
  clear.addEventListener("click", reset)
  window.addCleanup(() => {
    input.removeEventListener("input", update)
    input.removeEventListener("keydown", keydown)
    clear.removeEventListener("click", reset)
  })
})
