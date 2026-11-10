# Quartz v4

## Math-Phys development

Use Node.js **26.13.0** (the version in `.node-version` and Docker) and npm >=10.9.2.
The supported Node.js minimum is 22.12.0; Node typings stay on the 22.x line.

```sh
npm ci
npm run check
npm test
npx quartz build
# Preview locally:
npx quartz build --serve
```

### 中英文概念词典

词典页面位于 `/dictionary`，语言选择首页和侧栏提供独立入口。没有搜索词时，
页面列出所有已收录概念的中英文标题；搜索可匹配中英文名称与别称。
词库按 20 个学科分组，整合中英文 Wikipedia 对应与经核对的 nLab 来源。
[词库数据与维护说明](data/dictionary/README.md)记录收录条件、待审候选、来源快照和更新方法。
可以直接编辑已有概念页，补充自己的定义、例子和文章关联。

中英文 Wiki 目录按[概念树](data/concept-tree/README.md)组织全部词条；数学基础下设集合论、
数理逻辑和范畴论。各分支按历史发展分层，交叉概念可在多个分类中出现，均链接到原概念页。
修改概念树或新增概念后，运行 `npm run tree:generate`；`npm run check` 会校验覆盖范围与页面同步。

每个概念使用一份 Markdown 文件，同时维护中英文名称：

1. 创建 `content/concepts/` 目录，将 `content/templates/concept.md` 复制到其中的 `<id>.md`。
2. 填写 `concept.id`、`concept.zh`、`concept.en` 和页面的 `title`，并编写正文。
3. 如有别称、缩写或不同译名，填入可选的 `concept.variants` 数组。
4. 运行 `npx quartz build --serve`，在词典页检查标题、搜索与概念链接。

`concept.id` 使用唯一且稳定的英文小写 kebab-case 标识，例如 `tensor-product`。
文件名建议与 ID 一致。中英文表示同一个概念时共用一个 ID；修改标题或译名时
保持 ID 不变，便可维持与文章的关联。概念页的 Markdown 正文可写定义、公式、
注解和参考资料，并通过普通链接或双向链接连接其他页面。

别称应写入 `concept.variants`，例如 `[张量乘积, tensor products]`。
不要为了词典搜索使用 Quartz 的 `aliases`：该字段会创建重定向页面，含义不同。

普通词条文章可从 `content/templates/article-with-concepts.md` 开始，放入现有的
`content/zh/`、`content/en/` 或其他内容目录。在文章的 frontmatter 中添加
`concepts` 数组，即可自动关联到对应概念：

```yaml
concepts:
  - tensor-product
```

`tensor-product` 已收录，可直接关联；使用其他 ID 前先在词典中确认。一篇文章可以关联多个概念，
同一概念也可以关联多篇中英文文章。正文中可使用
`[[concepts/tensor-product|张量积]]` 链接到 `content/concepts/tensor-product.md`；
这种正文链接供读者跳转，`concepts` 字段用于维护概念与文章的关联。

构建会检查概念 ID 是否重复、中英文名称是否为空、文章引用的 ID 是否存在；
错误会指出具体文件和字段。预览中遇到这些元数据错误时，修正并保存即可继续重建。

`content/templates/` 已被站点的 `ignorePatterns` 排除，模板不会发布，也不会
出现在词典中。请先复制模板再录入内容，避免直接编辑模板后期待其出现在网站。

### Dependency maintenance — 2026-11-10

Dependencies and the lockfile have been refreshed, including Sharp 0.35.5,
Satori 0.63.2, TOML 5.0.1, minimatch 11.0.5, Shiki 4.6.0, esbuild 0.28.2,
and TypeScript 6.0.3. TypeScript now uses bundler module resolution to match
Quartz's esbuild pipeline. CI checks both the site and documentation on `main`.

Two overrides remain necessary until upstream dependency ranges catch up:

- `katex: "$katex"` keeps remark/rehype on the same patched KaTeX version as
  the explicitly declared dependency and generated CDN URLs. The old 0.16.x
  range is affected by [GHSA-238p-pmpm-9mq7](https://github.com/KaTeX/KaTeX/security/advisories/GHSA-238p-pmpm-9mq7).
- `satori > fflate: ^0.8.2` replaces Satori's vulnerable 0.7.x dependency,
  including its font parser dependency, with the patched compatible API.

Preact 11, TypeScript 7, js-yaml 5, chokidar 6, simple-git 1, and Typst 0.7
are deferred to separate migrations. This update retains their existing
release lines (TypeScript moves to 6) while applying available security fixes.
Mermaid's browser CDN dependency is updated separately to 11.17.2.

Validation completed with Node 26.13.0 and 22.23.4: type/style checks, all 86
tests, and the content build pass. The 76-file documentation build also passes
on Node 26. A clean `npm ci` and `npm audit` report zero known vulnerabilities.
Chromium checks pass for both language switches, bilingual search, local/global
graphs, Mermaid, and all six sample Upmath images, with no browser or network
errors.

Docker was also validated on Linux amd64 using an isolated rootless Docker
29.8.2 daemon. The image builds from `node:26.13.0-slim`, installs from the lockfile,
and passes type/style checks, all 86 tests, both content/documentation builds,
and `npm audit` (zero known vulnerabilities) inside the container. The image
excludes nested `.quartz-cache` directories and generated `public` files.
The default preview command serves `/`, `/en/`, and `/zh/`; WebSocket reload
notifications and adding/editing notes work.

The deletion check exposed an existing preview limitation: deleting a Markdown
file removes it from the content index and sends a reload notification, but the
previously generated HTML remains accessible. The affected incremental emitter
was unchanged by this dependency update. A full build clears stale output.

```sh
docker build -t math-phys:deps-20261110 .
docker run --rm math-phys:deps-20261110 sh -c \
  'npm run check && npm test && npx quartz build && npx quartz build -d docs -o public/docs && npm audit'
docker run --rm -p 127.0.0.1:8080:8080 -p 127.0.0.1:3001:3001 math-phys:deps-20261110
```

> “[One] who works with the door open gets all kinds of interruptions, but [they] also occasionally gets clues as to what the world is and what might be important.” — Richard Hamming

Quartz is a set of tools that helps you publish your [digital garden](https://jzhao.xyz/posts/networked-thought) and notes as a website for free.
Quartz v4 features a from-the-ground rewrite focusing on end-user extensibility and ease-of-use.

🔗 Read the documentation and get started: https://quartz.jzhao.xyz/

[Join the Discord Community](https://discord.gg/cRFFHYye7t)

## Sponsors

<p align="center">
  <a href="https://github.com/sponsors/jackyzha0">
    <img src="https://cdn.jsdelivr.net/gh/jackyzha0/jackyzha0/sponsorkit/sponsors.svg" />
  </a>
</p>
