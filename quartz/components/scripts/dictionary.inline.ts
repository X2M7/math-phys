import { normalizeDictionaryText } from "../../util/dictionary"

document.addEventListener("nav", () => {
  const dictionary = document.querySelector<HTMLElement>(".dictionary")
  if (!dictionary) return

  const sources = document.querySelector<HTMLDetailsElement>("details#dictionary-sources")
  const revealSourceAnchor = (hash: string) => {
    if (!sources || !hash) return
    let target: HTMLElement | null
    try {
      target = document.getElementById(decodeURIComponent(hash.slice(1)))
    } catch {
      return
    }
    if (target && (target === sources || sources.contains(target))) {
      sources.open = true
      target.scrollIntoView()
    }
  }
  const onHashChange = () => revealSourceAnchor(window.location.hash)
  const onAnchorClick = (event: MouseEvent) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
      return
    if (!(event.target instanceof Element)) return
    const anchor = event.target.closest<HTMLAnchorElement>("a[href]")
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return
    const url = new URL(anchor.href, window.location.href)
    if (url.origin === window.location.origin && url.pathname === window.location.pathname) {
      revealSourceAnchor(url.hash)
    }
  }
  onHashChange()
  window.addEventListener("hashchange", onHashChange)
  // Quartz handles same-page anchors with pushState, which does not emit hashchange.
  document.addEventListener("click", onAnchorClick, true)

  const input = dictionary.querySelector<HTMLInputElement>("#dictionary-query")!
  const subject = dictionary.querySelector<HTMLSelectElement>("#dictionary-subject")!
  const clear = dictionary.querySelector<HTMLButtonElement>(".dictionary-clear")!
  const count = dictionary.querySelector<HTMLElement>("#dictionary-count")!
  const noResults = dictionary.querySelector<HTMLElement>(".dictionary-no-results")!
  const heading = dictionary.querySelector<HTMLElement>(".dictionary-summary h2")!
  const entries = [...dictionary.querySelectorAll<HTMLElement>("[data-dictionary-entry]")].map(
    (element) => ({
      element,
      search: normalizeDictionaryText(element.dataset.search ?? ""),
      subjects: JSON.parse(element.dataset.subjects ?? "[]") as string[],
    }),
  )

  const update = () => {
    const terms = normalizeDictionaryText(input.value).split(" ").filter(Boolean)
    const selectedSubject = subject.value
    let visible = 0
    for (const entry of entries) {
      const matches =
        (selectedSubject === "" || entry.subjects.includes(selectedSubject)) &&
        terms.every((term) => entry.search.includes(term))
      entry.element.hidden = !matches
      if (matches) visible++
    }
    const filtering = terms.length > 0 || selectedSubject !== ""
    heading.textContent = filtering ? "筛选结果 / Filtered concepts" : "全部概念 / All concepts"
    count.textContent = filtering
      ? `${visible} / ${entries.length} 个概念 · ${visible} of ${entries.length} concepts`
      : `${entries.length} 个概念 / ${entries.length} concepts`
    clear.hidden = input.value.length === 0 && selectedSubject === ""
    noResults.hidden = entries.length === 0 || visible !== 0
  }

  const reset = () => {
    input.value = ""
    subject.value = ""
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
  subject.disabled = subject.options.length <= 1
  update()
  input.addEventListener("input", update)
  input.addEventListener("keydown", keydown)
  subject.addEventListener("change", update)
  clear.addEventListener("click", reset)
  window.addCleanup(() => {
    window.removeEventListener("hashchange", onHashChange)
    document.removeEventListener("click", onAnchorClick, true)
    input.removeEventListener("input", update)
    input.removeEventListener("keydown", keydown)
    subject.removeEventListener("change", update)
    clear.removeEventListener("click", reset)
  })
})
