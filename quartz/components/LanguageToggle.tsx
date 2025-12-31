import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

const LanguageToggle: QuartzComponent = (props?: QuartzComponentProps) => {
  // 关键：防止 props 为 undefined
  if (!props || !props.fileData) return null

  const fm = props.fileData.frontmatter ?? {}
  const lang = (fm.lang as string) ?? "en"
  const alt = fm.alt as string | undefined

  // 没有 alt 的页面不显示按钮
  if (!alt) return null

  const title = lang === "zh" ? "Switch to English" : "切换到中文"
  const label = lang === "zh" ? "EN" : "中"

  return (
    <a class="lang-toggle" href={alt} title={title} aria-label={title}>
      {label}
    </a>
  )
}

LanguageToggle.css = `
.lang-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;

  width: 38px;
  height: 38px;
  border-radius: 999px;

  font-size: 16px;
  font-weight: 700;
  color: currentColor;
  text-decoration: none;

  transition: transform .15s ease, opacity .15s ease;
}
.lang-toggle:hover {
  transform: scale(1.10);
  opacity: 0.85;
}
`

export default (() => LanguageToggle) satisfies QuartzComponentConstructor
