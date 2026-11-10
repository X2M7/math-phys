---
title: 词典收录范围与来源 / Dictionary sources
description: 数学物理双语词典的来源、收录条件与覆盖范围。
socialImage: og-image.png
graph: false
---

[返回词典 / Back to dictionary](dictionary)

本词典提供数学基础、现代数学与理论物理主要分支的中英文名称索引，方便继续编写定义与关联文章。
当前快照采集于 **2026-11-10**，收录 **4,205 个概念**，其中 **1,356 个**附有核对过对应关系的 nLab 链接。

这是有明确来源边界、持续扩充的词库，不能视为全部数学物理词汇的穷尽清单。

## 名称与来源

- 每项中文和英文名称均来自实际存在的 Wikipedia 页面，两个页面必须对应同一 Wikidata 实体；页面中保留来源及采集时版本链接。
- nLab 对应关系使用 Wikidata 的 [nLab 标识 P4215](https://www.wikidata.org/wiki/Property:P4215)，并与 [nLab 官方源码快照](https://github.com/ncatlab/nlab-content/tree/c35cfa6ed9b33a9d2455ff294b78df6c37ac2f4f)核对。没有明确对应时不猜测链接。
- 简繁标题经中文 Wikipedia 官方 API 核验；其他别名来自 Wikidata 标签及别名。来源核验不等于逐项人工审定；同一术语的地区译名、历史称呼和适用语境仍可能需要修订。
- 这里整理名称、链接和版本元数据，不转载原站的定义、证明或文章正文。Wikidata 结构化数据按 [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing) 提供；原站文章的使用应遵循各自许可。

候选范围由 107 个 Wikipedia 学科分类的直接页面成员、510 个显式基础概念标题，以及 nLab 的 Wikidata 标识集合组成。
这能同时覆盖常见基础词和部分现代数学术语，但没有中文页面、尚未建立跨站对应或超出这些来源范围的概念可能尚未正式收录。

## 学科覆盖

一个概念可以属于多个学科，所以下表不能直接相加为总数。

| 学科 / Subject                                                | 概念数 |
| ------------------------------------------------------------- | -----: |
| 数学基础与逻辑 / Foundations and logic                        |    369 |
| 代数 / Algebra                                                |    563 |
| 范畴论 / Category theory                                      |     71 |
| 拓扑学 / Topology                                             |    242 |
| 几何学 / Geometry                                             |    382 |
| 分析学 / Analysis                                             |    473 |
| 微分方程与动力系统 / Differential equations and dynamics      |    266 |
| 概率与统计 / Probability and statistics                       |    113 |
| 数论 / Number theory                                          |    193 |
| 离散数学 / Discrete mathematics                               |    163 |
| 数值分析与优化 / Numerical analysis and optimization          |    177 |
| 经典力学与连续介质 / Classical and continuum mechanics        |    428 |
| 电磁学与光学 / Electromagnetism and optics                    |    182 |
| 热力学与统计物理 / Thermodynamics and statistical physics     |    274 |
| 量子力学与量子信息 / Quantum mechanics and information        |    205 |
| 相对论与引力 / Relativity and gravitation                     |    176 |
| 量子场论与粒子物理 / Quantum field theory and particles       |    310 |
| 凝聚态物理 / Condensed matter physics                         |    178 |
| 数学物理与量子引力 / Mathematical physics and quantum gravity |    260 |
| 宇宙学 / Cosmology                                            |    149 |

## 待补与待审

保留 **8,369 个去重候选**用于后续补译或核对；其中包括只有 Wikidata 中文标签、缺少中文页面、身份对应或学科范围需复核的项目。
这些候选不出现在正式词典列表中。另有 **2,041 项**记录为排除，原因包括人物、机构、文献、软件、具体事件、范围外主题或无法明确对应的 nLab 标识。

[词库、待审清单及维护说明](https://github.com/X2M7/math-phys/tree/main/data/dictionary)保留机器可读数据、处理理由和复现方法。
这是初步来源核验与抽查的结果，欢迎在核对原文后修订译名、别名和分类。

## 与自己的文章关联

每个概念有稳定 ID，例如 `tensor-product` 和 `manifold`。可以直接在概念页面补充自己的定义、公式与例子，
也可以在单独文章的 frontmatter 中写入：

```yaml
concepts:
  - tensor-product
  - manifold
```

词典会自动列出关联文章。修改概念标题或译名时保留 ID，文章关联就会继续有效。

---

This is a growing, source-linked index of Chinese and English mathematical and physical terminology.
Both Wikipedia pages must resolve to the same Wikidata item; nLab links are additionally checked against its official source snapshot.
Names and aliases have not all undergone editorial review. The collection is broad but not exhaustive; unresolved translations remain in a separate review queue.
