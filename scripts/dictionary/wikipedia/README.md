# Wikipedia 词汇来源采集

这些脚本手动采集名称与来源元数据，不复制 Wikipedia 正文，也不会在站点构建或 CI 中联网执行。只依赖 Python 3 标准库。

## 复现已有快照

在仓库根目录依次执行：

```sh
python3 -B scripts/dictionary/wikipedia/collect.py
python3 -B scripts/dictionary/wikipedia/collect_core.py
```

默认工作目录为 `.dictionary-cache/wikipedia/`。`collect.py` 从明确列出的分类取得直接成员，生成基础目录；`collect_core.py` 补充核心概念，并更新同一目录中的 `catalog.json`。必须先完成基础采集，再运行核心补充。

已有 HTTP 响应会按完整请求参数缓存，重复运行会复用缓存，不保证读到上游的最新修改。基础采集重建目录后，核心补充会重新应用核心种子，不会丢失这部分覆盖。

两个脚本都接受 `--workdir`，也支持环境变量 `MATH_PHYS_DICTIONARY_CACHE`；命令行参数优先。例如，复用本次工作的缓存：

```sh
python3 -B scripts/dictionary/wikipedia/collect.py \
  --workdir /tmp/math-phys-wiki-research
python3 -B scripts/dictionary/wikipedia/collect_core.py \
  --workdir /tmp/math-phys-wiki-research
```

输出与缓存均写入工作目录，源码目录只存脚本和种子清单。

## 取得新的上游快照

选择新的工作目录可以避免复用旧响应。下面的命令以 UTC 时间创建一次独立采集：

```sh
export MATH_PHYS_DICTIONARY_CACHE="$PWD/.dictionary-cache/wikipedia-$(date -u +%Y%m%dT%H%M%SZ)"
python3 -B scripts/dictionary/wikipedia/collect.py
python3 -B scripts/dictionary/wikipedia/collect_core.py
```

中断后使用同一个环境变量或显式 `--workdir` 重跑，即可复用已完成的请求。脚本使用可识别的 User-Agent，最多两个并发请求，限制请求频率，并对限流和暂时的服务器错误退避重试。

采集完成后，人工检查候选，再按照[词库维护说明](../../../data/dictionary/README.md)合并 nLab 数据并生成概念页。合并时，将 `assemble.py` 的 `--wikipedia` 参数设为这次工作目录中的 `catalog.json`。明确排除和待审条目统一由 `data/dictionary/editorial-review.json` 管理。

## 可选：补充可靠的简繁标题别名

先合并出初版 `data/dictionary/catalog.json`，再运行标题变体采集，最后带变体文件重新合并。以下示例使用默认缓存路径：

```sh
python3 scripts/dictionary/assemble.py \
  --wikipedia .dictionary-cache/wikipedia/catalog.json \
  --nlab .dictionary-cache/nlab/wikidata-catalog.json \
  --supplement .dictionary-cache/nlab/wikipedia-supplement.json \
  --review data/dictionary/editorial-review.json

python3 -B scripts/dictionary/wikipedia/collect_title_variants.py \
  --catalog data/dictionary/catalog.json

python3 scripts/dictionary/assemble.py \
  --wikipedia .dictionary-cache/wikipedia/catalog.json \
  --nlab .dictionary-cache/nlab/wikidata-catalog.json \
  --supplement .dictionary-cache/nlab/wikipedia-supplement.json \
  --review data/dictionary/editorial-review.json \
  --title-variants .dictionary-cache/wikipedia/title-variants.json
```

`collect_title_variants.py` 同样支持 `--workdir` 和 `MATH_PHYS_DICTIONARY_CACHE`。使用其他工作目录时，相应调整合并命令中的输入路径。

脚本按已有中文页面 ID 分批请求 `prop=info|pageprops&inprop=varianttitles`，只读取 Wikipedia 自己提供的 `zh-hans` 与 `zh-hant` 标题，不抓正文，也不猜测翻译。每条结果记录页面 ID、版本 ID、QID；只有 QID 与初版目录一致时才进入可用结果。页面缺失、身份变化、消歧义或不能直接使用的显示标题进入 `unresolved`，不应用到词库。

输出为工作目录中的 `title-variants.json`。采集脚本不修改主标题、正式目录或 Markdown；后续合并只将核验通过的简繁标题增加为别名。该步骤针对文章标题，不会自动转换词条的所有既有同义词；来自重定向页的别名需要另外核对重定向目标。

## 覆盖与身份核验

- `seeds.json`：20 个学科组、107 个分类种子，仅收集其直接的正文命名空间成员，不递归整个分类树。
- `core-seeds.json`：510 个明确的核心标题，补齐集合、线性代数、范畴、几何、分析以及理论物理等基础内容。新增种子只为缺少的页面、实体和中文页请求元数据。
- 每条候选保留英文页和中文页的页面 ID、版本 ID、实际 URL，以及 Wikidata QID、版本、标签、别名、简短语境描述、P31 类型和 P4215 nLab 标识。分类和核心种子的收录路径也会保留。
- `verified` 必须同时存在中英文页面、两边 QID 一致，且不是消歧义页。这个状态表示来源身份核验通过，发布前仍需检查学科范围和译名。
- 仅有 Wikidata 中文标签、没有可核验中文 Wikipedia 对应页的条目进入 `labelBased`；缺少中文对应或实体不一致的条目进入 `pending`。这两类均不自动提升为正式双语条目。
- 人物、作品、机构、列表等非概念类型进入 `excluded`，保留理由。分类与类型过滤不是完整的人工学科审查，因此后续合并还要应用编辑审查清单。

章节重定向不能证明两个概念是同义词。例如 `Reduced Planck constant` 指向 `Planck constant` 的一个章节，`Edge (graph theory)` 指向图论术语表中的一项。核心采集将这类标题列入 `core-report.json` 的 `section_redirects`，不会将它们直接合并成独立的已核验词条。`seed_titles` 是检索来源，不应直接充当同义词列表。

这是一组可追溯、可扩充的收录边界，不声称包含全部数学物理术语。没有中文对应、消歧义和不同语言覆盖范围不一致的情况会明确保留，便于后续审定。

## 工作目录中的文件

- `catalog.json`：完成基础采集和核心补充后的四类候选，是合并流水线的输入。
- `report.json`：基础分类阶段的统计与空分类清单；其计数不包含后续核心补充。
- `core-report.json`：核心标题覆盖情况、缺失页面、章节重定向与本轮补充结果。
- `*-metadata.json`、`category-members.json`：可复用的来源元数据。
- `title-variants.json`：可选的简繁标题别名来源及未通过核验的报告。
- `cache/`：HTTP JSON 响应缓存。用于复现快照，不是站点构建输入。

API 行为参考 [MediaWiki Langlinks](https://www.mediawiki.org/wiki/API:Langlinks)、[Categorymembers](https://www.mediawiki.org/wiki/API:Categorymembers) 和 [Wikidata API](https://www.wikidata.org/wiki/Wikidata:Data_access#Wikidata_API)。
