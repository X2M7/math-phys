# 中文译名证据采集

`collect_termonline.py` 查询全国科学技术名词审定委员会“术语在线”的公开精确划词查询接口。只需 Python 3 标准库，无登录信息、Cookie 或私有数据。网站构建不调用此脚本，也不要求联网。

输入为包含 `qid`、`en` 的数组，或含 `entries` 数组的 JSON。输入名单须先核对英文 Wikipedia 实体身份、数学物理范围及中文页面缺失情况。查询只产生待审证据，不自动发布译名。

```sh
python scripts/dictionary/translations/collect_termonline.py \
  --input .dictionary-cache/translations/english-only-candidates.json \
  --priority .dictionary-cache/translations/priority-100.json \
  --max-requests 200

# 继续同一批名单：已有查询使用缓存；0 表示逐一查询全部尚未缓存的候选。
python scripts/dictionary/translations/collect_termonline.py \
  --input .dictionary-cache/translations/english-only-candidates.json \
  --max-requests 0 --delay 1

# 离线复现已缓存证据；不进行任何网络请求。
python scripts/dictionary/translations/collect_termonline.py \
  --input .dictionary-cache/translations/english-only-candidates.json --offline
```

`--workdir` 指定缓存和结果目录，默认 `.dictionary-cache/translations/`。每次查询原始 JSON 位于 `termonline-cache/`，整理后的证据为 `termonline-candidates.json`。请求单线程执行，默认间隔一秒；遇到失败、访问限制或身份验证要求即停止，不尝试绕过。默认每次最多发出 200 个新请求，可显式调整。无结果只表示本次精确查询未返回记录，不证明不存在标准译名。

对英文查不到或命中另一学科的候选，可以另建 `{ "qid": "…", "en": "…", "lookup": "人工选择的检索词" }` 记录，使用 `--query-field lookup`。中文候选只作搜索线索；输出仍按原 `en` 检查返回的官方英文词对，并要求学科和定义复核。不得把检索词本身当成官方译名。此选项也可保存有明确依据的英文拼写检索变体；不得用近似匹配代替概念判断。

审校时核对英文名、概念定义、学科及术语记录。英文拼写完全相同也可能是不同概念，例如数学的 `branch point` 和园林的同名术语；`null vector` 的零模向量义也不能采用普通零向量的译名。只规范化字形、空白和横线，不删除限定词、不作近似匹配、不从 Wikidata 标签或机器翻译推断审定依据。

审定公布名词库、征求意见库、两岸对照库及其他术语库不可混同。正式采用的来源须保存原中文 `sourceZh`、原英文 `sourceEn`、术语编码、公布年、学科、版本和详情 URL。应优先采用概念所属基础学科的定名，不机械选择公布年份最新的跨学科同词。正式采用条目还须核对 Wikipedia 页面及 QID，并人工审查对应关系；本脚本的两个布尔标记并非自动发布许可。

官方[《审定原则及方法》](https://cnterm.cn/sdgb/sdyzjff/)第 6.3.3.1 条说明中文名的方括号内为可省略字。主名可采用完整展开形式，省略形式列为别名，同时原样保存出处的括号写法。不得把来源的“概形”等用词悄悄改成自选形式。学术用法与正式审定名词分别标识，地区译名须注明适用地区。

## 生成英文候选并核验身份

`collect_candidates.py` 从已有采集快照生成候选，不联网。先按 [Wikipedia 采集说明](../wikipedia/README.md) 和 [nLab 采集说明](../nlab/README.md) 更新来源；维持现有快照时无需重复下载。它读取 Wikipedia 的 `catalog.json`、英文页面和 Wikidata 实体元数据，以及可选的 nLab `wikidata-catalog.json`、`wikipedia-supplement.json` 和页面元数据。只收录英文页 QID 与 Wikidata 英文站点链接一致、两处均无关联中文页、学科范围已建立的记录。

现有 `data/dictionary/pending.json` 可直接作为输入。来源快照更新后，也可以先离线合成一份新的待审列表，输出到缓存目录，供继续筛选。缓存合成目录须先复制学科配置与现有目录，以保留已发布条目的稳定 ID：

```sh
mkdir -p .dictionary-cache/translations/base
cp data/dictionary/subjects.json data/dictionary/catalog.json .dictionary-cache/translations/base/

python scripts/dictionary/assemble.py \
  --wikipedia .dictionary-cache/wikipedia/catalog.json \
  --nlab .dictionary-cache/nlab/wikidata-catalog.json \
  --supplement .dictionary-cache/nlab/wikipedia-supplement.json \
  --review data/dictionary/editorial-review.json \
  --output .dictionary-cache/translations/base

python scripts/dictionary/translations/collect_candidates.py \
  --pending .dictionary-cache/translations/base/pending.json \
  --catalog data/dictionary/catalog.json \
  --wikipedia-workdir .dictionary-cache/wikipedia \
  --nlab-workdir .dictionary-cache/nlab \
  --workdir .dictionary-cache/translations
```

若沿用仓库当前待审列表，省略 `--pending` 即可；`--editorial-review`、`--subjects` 也可显式指定，默认使用 `data/dictionary/` 下的相应文件。输出包括 `english-only-candidates.json`、`priority-100.json`、`priority-100.tsv` 和 `report.json`。候选里的 `candidateZh*` 只是 Wikidata 原标签，和正式的 `zh`、`translation` 字段分开；候选没有后两字段，也没有本轮实时核验凭证。排名仅用于安排审校顺序，不代表术语重要性或完整覆盖。缺失元数据、已有中文页、实体不一致及范围排除分别保留在 `deferred` 或 `filtered` 中。

随后运行上面的术语查询并审校结果，将选定的 `qid`、原英文 `en`、简体主名 `zh`、已审别名 `variants` 及 `translation` 证据保存为单独的 `reviewed-translations.json`。证据结构见 [正式录入结构](../../../data/dictionary/README.md)。只对这个子集重新查询英文 Wikipedia 和 Wikidata：

```sh
python scripts/dictionary/translations/verify_wikipedia.py \
  --reviewed .dictionary-cache/translations/reviewed-translations.json \
  --candidates .dictionary-cache/translations/english-only-candidates.json \
  --output .dictionary-cache/translations/verified-translations.json
```

核验输出的 `entries` 已合并译名证据与候选的 ID、学科和 nLab 映射，并填入当前英文页面 ID、修订号、Wikidata 修订号及 `wikipediaVerification`。出现中文站点链接、英文页 QID/页面 ID/标题变化、消歧义页或非概念实体时会分流到 `outcomes`，不会混入可采用记录。“无中文页”仅指无关联中文站点链接，不排除中文 Wikipedia 中存在尚未关联的页面。

核验按 UTC 日期逐个 QID 缓存：追加名单只请求新增身份，同日修改译名证据可直接复用身份快照；`--refresh` 强制重新查询所选身份。`--workdir` 或 `MATH_PHYS_TRANSLATION_WIKIPEDIA_CACHE` 可改变缓存位置，默认 `.dictionary-cache/translations/wikipedia/`。常规构建不会调用核验脚本。完成译名与范围复核后，将采纳记录合入 `data/dictionary/english-only-reviewed.json`，再按数据说明运行离线合成与页面生成；这些采集脚本本身不修改正式词库或内容页。

少量未被分类采集覆盖的概念，也可以人工建立候选数组。例如下面的 ID/QID 对应英文 `Prismatic cohomology`；学科须依据概念内容核实，已有条目应沿用其 ID：

```json
{
  "entries": [
    {
      "id": "prismatic-cohomology",
      "qid": "Q141284593",
      "en": "Prismatic cohomology",
      "subjects": ["algebra", "geometry", "number-theory"],
      "sources": { "nlab": [] }
    }
  ]
}
```

`verify_wikipedia.py` 会为这种候选获取真实英文页面和 Wikidata 元数据，因此不需编造页面 ID 或修订号。`subjects` 使用 `data/dictionary/subjects.json` 中的 ID；nLab 映射若没有经核实的官方来源路径，就保留空数组。译名仍须来自另一个已审的输入文件。已经包含完整候选元数据的已审文件可以省略 `--candidates`。
