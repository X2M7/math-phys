# 数学物理中英文词库

`catalog.json` 是正式收录的来源快照，`content/concepts/` 是可直接编辑的概念页面。
这是持续扩充的术语名称与参考来源索引，不声称穷尽全部数学物理词汇，也不是已逐条审定的翻译标准。

- `catalog.json`：稳定 ID、QID、中英文标题、来源别名、学科、Wikipedia 页面 ID/修订版本，以及经核对的 nLab 链接。
- `english-only-reviewed.json`：没有关联中文 Wikipedia 页面的已审译名、正式术语或学术文献依据，以及英文页面身份和中文关联状态的核验记录。刷新时必须保留此文件。
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

正式收录有两条路径，英文页面均须实际存在、不是消歧页，并通过页面自身的 QID 核验概念身份：

1. **有中英文 Wikipedia 对应页**：两个页面的 Wikidata QID 相同。中文主名称使用 `varianttitles` API 核验的 `zh-hans` 简体标题；原始标题、URL、页面 ID 和修订版本保留，繁体标题保留为可搜索的别名。其他来源别名取自该实体的 Wikidata 标签/别名，尚未全部人工审定。
2. **未找到关联中文页，有可靠中文译名**：同时核验英文页面的语言链接和 Wikidata 的中文站点链接。中文译名优先采用全国科学技术名词审定委员会公布、由术语在线提供的正式学科名词；没有适用审定词条时，采用高校、研究机构或学术期刊中可核对的中英用法。逐条记录原文词对、发布机构、出处、术语编码或文献定位、核验日期，并区分 `official-terminology` 与 `academic-usage`。同英文不同学科的含义不能仅凭字符串匹配收录。

第二条路径的主名称同样用简体。正式名词中的方括号按[审定原则及方法](https://cnterm.cn/sdgb/sdyzjff/)表示可省略部分，采用完整名称，并保留来源原写法及简称。没有可靠依据的中文标签或直译继续留在待审清单；学术用法不标称为唯一标准译名。“未找到关联中文页”是核验时的跨站关联状态，不等于证明中文 Wikipedia 上没有尚未关联的文章。

不会机械转换来源 URL、标识符或作者自写正文，也不把跳转到另一页面某个章节的英文标题自动当成同义词。

nLab 通过官方 [nlab-content](https://github.com/ncatlab/nlab-content) 固定提交的源码快照核对页面名称、重定向与类别，
并通过 Wikidata [P4215](https://www.wikidata.org/wiki/Property:P4215) 建立对应。
未找到明确对应时不猜测 nLab 地址。只有 Wikidata 中文标签而没有可靠译名依据的项目进入待审清单。

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
python3 -m unittest discover -s scripts/dictionary -p 'test_*.py'
npx quartz build
```

生成器只创建不存在的概念文件。已有文件会核对 ID 与 QID 后原样保留，包括手写正文、译名、分类和别名。
新生成页面的标题、摘要和概念主名统一使用简体。有中文 Wikipedia 的页面必须具有核验过的简体标题；无关联中文页的页面必须具有完整的译名依据和页面身份核验记录，并单列“中文译名依据”。检查会拒绝缺少这些证据的记录。来源中的不同写法在别名区保留。
路径被另一概念占用时会报错，不覆盖。正式目录里的 QID 唯一；重新整理目录时沿用已有 QID 的 ID。
删除正式概念应同时修改目录与概念页，并检查文章的 `concepts` 引用。正常构建无需访问任何词库 API。

## 手动刷新来源

采集工具使用 Python 3 标准库；输出和 HTTP 缓存默认放在 Git 忽略的 `.dictionary-cache/`。
它们有请求限速、分页、重试和缓存，刷新操作不在构建或 CI 中自动运行。
使用一个新的缓存目录可以取得新的快照；复用旧缓存则用于复现已有结果。

1. 运行 `scripts/dictionary/wikipedia/` 的分类采集与核心词补充。
2. 运行 `scripts/dictionary/nlab/` 的官方源码元数据、Wikidata 标识和中英页面核验。
3. 人工检查新增候选和范围，把明确需要排除的 QID 记录在 `editorial-review.json`。
4. 对没有关联中文页的候选，使用 `scripts/dictionary/translations/` 的工具查找术语线索，人工核对概念含义和译名后，再核验 Wikipedia/Wikidata 身份；将通过的完整记录纳入 `english-only-reviewed.json`。
5. 用 `assemble.py` 合并元数据，再运行 Wikipedia 标题变体采集并携带 `--title-variants` 重新合并。无中文页的记录会跳过中文标题采集，不生成虚构链接。
6. 先审阅 Git diff，再运行 `dictionary:generate`。

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

`assemble.py` 默认读取仓库中的 `english-only-reviewed.json`，也可用 `--english-only` 指定已审输入。显式输入缺失，或已有译名记录而默认文件缺失时，组装会失败，避免刷新时静默丢失条目。已审译名不能绕过范围排除或待核决定；若未来取得同 QID 的中英文页面核验，优先使用双语 Wikipedia 记录。原始译名审核文件仍保留以供追溯。

重新整理来源不会自动覆盖已有 Markdown 的字段；需要采用来源的新译名/别名时，逐项审阅并手动更新相应概念页。
更新 `content/dictionary.md` 中 `dictionary-sources` 折叠区的统计和日期，完成构建、搜索、移动端及来源链接检查后再发布。概念页的来源说明链接统一指向 `../dictionary#dictionary-sources`。
