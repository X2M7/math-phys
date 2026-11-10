# 数学物理中英文词库

`catalog.json` 是正式收录的来源快照，`content/concepts/` 是可直接编辑的概念页面。
这是持续扩充的术语名称与参考来源索引，不声称穷尽全部数学物理词汇，也不是已逐条审定的翻译标准。

- `catalog.json`：稳定 ID、QID、中英文标题、来源别名、学科、Wikipedia 页面 ID/修订版本，以及经核对的 nLab 链接。
- `subjects.json`：20 个学科组的中英文标签；一项可以属于多个组。
- `manifest.json`：采集日期、来源边界、正式收录/待审/排除统计。
- `core-coverage.json`：510 个基础标题的来源核验结果，另列章节重定向与缺漏。
- `variant-review.json`：简繁标题采集中未能通过页面身份核验的记录。
- `pending.json`：缺少中文页面、只有 Wikidata 中文标签、实体对应或学科范围需复核的候选。不是已认可的中文译名表。
- `excluded.json`：人物、机构、文献、软件、具体事件及范围外主题等的排除记录。
- `editorial-review.json`：抽查发现的问题及逐项处理理由，供下一次整理复用。

## 来源与收录条件

英文候选来自明确列出的 Wikipedia 学科分类的直接页面成员、基础概念种子，以及 nLab 的 Wikidata `P4215` 标识。
不递归抓取整棵分类树。分类范围和核心标题保存在采集脚本旁及清单中。

正式收录要求英文、中文 Wikipedia 页面均实际存在、不是消歧页，并且两个页面的 Wikidata QID 相同。
中文主名称使用中文 Wikipedia `varianttitles` API 核验的 `zh-hans` 简体标题。原始页面标题、URL、页面 ID 和修订版本保留在来源元数据中，繁体标题和其他来源写法保留为可搜索的别名。
其他别名取自该实体的 Wikidata 标签/别名；不会机械转换来源 URL、标识符或作者自写正文。
这些变体可搜索，但仍需人工审定；不把跳转到另一页面某个章节的英文标题自动当成同义词。

nLab 通过官方 [nlab-content](https://github.com/ncatlab/nlab-content) 固定提交的源码快照核对页面名称、重定向与类别，
并通过 Wikidata [P4215](https://www.wikidata.org/wiki/Property:P4215) 建立对应。
未找到明确对应时不猜测 nLab 地址。没有中文 Wikipedia 对应的 Wikidata 中文标签进入待审清单。

只采集名称、别名、链接和身份/版本元数据，不复制 Wikipedia/nLab 的定义、证明和文章正文。
Wikidata 的结构化数据按 [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing) 提供；
nLab 不应被统一标注为 CC BY-SA。引用原文时请另外核对对应来源的许可并保留归属。
站点每个概念页都保留原始链接和 Wikipedia/Wikidata 的采集时修订链接。

## 作者录入与关联文章

编辑已有 `content/concepts/<id>.md`，在来源索引之后补充自己的定义、公式、例子和参考资料。
保留 `concept.id` 与 `dictionarySource.qid`，修改译名时可更新 `concept.zh`、页面标题和正文。
新写的独立文章使用：

```yaml
concepts:
  - tensor-product
  - manifold
```

词典会自动展示这些关联文章。新概念可从 `content/templates/concept.md` 复制；手工概念无需伪造 `dictionarySource`。
若改动学科，使用 `subjects.json` 中的完整双语标签，避免产生多个同义筛选项。

初始来源索引页设置 `graph: false`，避免数千条索引淹没文章关系图；词典、搜索和文章关联仍可使用。
写好自己的概念说明后，可以删除此字段或改为 `graph: true`，将该概念纳入关系图。

## 离线生成与检查

```sh
npm run dictionary:generate
npm run dictionary:check
npm run check
npm test
npx quartz build
```

生成器只创建不存在的概念文件。已有文件会核对 ID 与 QID 后原样保留，包括手写正文、译名、分类和别名。
新生成页面的标题、摘要、概念主名和中文 Wikipedia 显示标签统一使用已核验的简体标题；缺少该标题或主名与其不一致时，检查会报错，须先完成标题变体核验。来源中的繁体写法在别名区明确保留。
路径被另一概念占用时会报错，不覆盖。正式目录里的 QID 唯一；重新整理目录时沿用已有 QID 的 ID。
删除正式概念应同时修改目录与概念页，并检查文章的 `concepts` 引用。正常构建无需访问任何词库 API。

## 手动刷新来源

采集工具使用 Python 3 标准库；输出和 HTTP 缓存默认放在 Git 忽略的 `.dictionary-cache/`。
它们有请求限速、分页、重试和缓存，刷新操作不在构建或 CI 中自动运行。
使用一个新的缓存目录可以取得新的快照；复用旧缓存则用于复现已有结果。

1. 运行 `scripts/dictionary/wikipedia/` 的分类采集与核心词补充。
2. 运行 `scripts/dictionary/nlab/` 的官方源码元数据、Wikidata 标识和中英页面核验。
3. 人工检查新增候选和范围，把明确需要排除的 QID 记录在 `editorial-review.json`。
4. 用 `assemble.py` 合并元数据，再运行 Wikipedia 标题变体采集并携带 `--title-variants` 重新合并。
5. 先审阅 Git diff，再运行 `dictionary:generate`。

各采集目录的 README 给出完整命令。合并命令：

```sh
python3 scripts/dictionary/assemble.py \
  --wikipedia .dictionary-cache/wikipedia/catalog.json \
  --nlab .dictionary-cache/nlab/wikidata-catalog.json \
  --supplement .dictionary-cache/nlab/wikipedia-supplement.json \
  --review data/dictionary/editorial-review.json
python3 scripts/dictionary/wikipedia/collect_title_variants.py
python3 scripts/dictionary/assemble.py \
  --wikipedia .dictionary-cache/wikipedia/catalog.json \
  --nlab .dictionary-cache/nlab/wikidata-catalog.json \
  --supplement .dictionary-cache/nlab/wikipedia-supplement.json \
  --review data/dictionary/editorial-review.json \
  --title-variants .dictionary-cache/wikipedia/title-variants.json
npm run dictionary:generate
```

重新整理来源不会自动覆盖已有 Markdown 的字段；需要采用来源的新译名/别名时，逐项审阅并手动更新相应概念页。
更新 `content/dictionary.md` 中 `dictionary-sources` 折叠区的统计和日期，完成构建、搜索、移动端及来源链接检查后再发布。概念页的来源说明链接统一指向 `../dictionary#dictionary-sources`。
