# nLab 来源与 Wikipedia 补充目录

这些脚本仅使用 Python 标准库，采集标题、别名、学科分类及页面标识，不复制词条正文。输出默认写入仓库的 `.dictionary-cache/nlab/`，不会自动修改或发布正式词条。

## 初次采集

在仓库根目录运行：

```sh
python scripts/dictionary/nlab/refresh_metadata.py
python scripts/dictionary/nlab/collect_wikidata.py
python scripts/dictionary/nlab/verify_wikipedia.py
```

`refresh_metadata.py` 默认使用此次目录固定的 nLab 提交 `c35cfa6ed9b33a9d2455ff294b78df6c37ac2f4f`。它读取 [nLab 官方推荐的 GitHub 镜像](https://ncatlab.org/nlab/show/HowTo)，流式处理归档，不访问站点禁止自动抓取的列表、导出或历史接口。

`collect_wikidata.py` 查询 P4215（nLab ID），通过官方快照校验页面和别名，再分批读取 Wikidata 的标签、别名、描述、P31、跨语言链接和修订号。人物、文献、机构及其他明确不属于概念的条目会被排除。缺少中文的条目保留在 `pending`；只有 Wikidata 中文标签的条目标为 `wikidata-label`，不会进入正式补充目录。

`verify_wikipedia.py` 使用 `candidate-ids.json` 中固定的 721 个候选，以保证主 Wikipedia 目录增加词条后，补充目录仍可独立复现。它检查中英文页面存在、命名空间、修订号、相同 QID 和非消歧状态，再检查学科范围。最终输出 `wikipedia-supplement.json`；未能确认语言对应或数学物理范围的条目保留在 `pending` 或 `excluded`。人工范围决定保存在 `scope-overrides.json`。

Wikidata 和 Wikipedia 的在线数据可能变化；固定 nLab 提交不代表其他来源也被固定。保留缓存才能精确重现已经核验的记录。

## 离线复查与自定义缓存

已有完整缓存时：

```sh
python scripts/dictionary/nlab/refresh_metadata.py --offline
python scripts/dictionary/nlab/collect_wikidata.py --offline
python scripts/dictionary/nlab/verify_wikipedia.py --offline
```

三条命令均支持 `--workdir PATH`；`--offline` 遇到缺失缓存会报错，不会偷偷访问网络。

主要输出如下：

- `page-metadata.json`：nLab 规范标题、真实 URL、别名和类别。
- `title-and-redirect-index.json`：无歧义的名称对应关系及单独列出的冲突。
- `wikidata-catalog.json`：有来源的中文候选、待补中文与排除记录。
- `wikipedia-supplement.json`：中英文 Wikipedia 页面核验结果。
- `wikidata-entities/`、`wikipedia-cache/`：复现用的原始 API 元数据缓存。

## 有意更新来源

```sh
python scripts/dictionary/nlab/refresh_metadata.py --ref master --refresh
python scripts/dictionary/nlab/collect_wikidata.py --refresh
python scripts/dictionary/nlab/verify_wikipedia.py --refresh --refresh-candidates \
  --wikipedia-catalog .dictionary-cache/wikipedia/catalog.json
```

也可给 `--ref` 传入指定的 nLab Git 提交。`--refresh-candidates` 根据当前已核验的主 Wikipedia 目录排除重复 QID；不加此参数时使用提交在仓库中的固定候选。调整范围判断可以使用 `--scope-overrides PATH`。每个脚本的 `--help` 列出完整参数。

更新结果仍须经项目的组装和校验步骤才能进入正式目录。来源相同或名称相同不代表释义已人工审定；页面重定向后 QID 不一致的候选不得直接合并。

## 来源说明

[Wikidata 结构化数据使用 CC0](https://www.wikidata.org/wiki/Wikidata:Licensing)。nLab 的[复用说明](https://ncatlab.org/nlab/show/HomePage)鼓励注明来源，但没有统一的正式许可证；这里记录来源链接，不将其标为 Wikipedia 的 CC BY-SA 许可。脚本不获取百科正文。
