---
title: Elasticsearch常见面试题总结
description: Elasticsearch面试题深度总结：倒排索引原理（Term Dictionary/Posting List/FST）、分词与中文分词器、分片副本与路由、集群高可用与脑裂、写入流程（translog/refresh/merge）、查询流程（query then fetch）、查询DSL、聚合分析、深分页（scroll/search_after）与性能调优。
category: 数据库
tag:
  - NoSQL
  - Elasticsearch
head:
  - - meta
    - name: keywords
      content: Elasticsearch面试题,ES索引,倒排索引,分片副本,全文搜索,聚合查询,Lucene,ELK,分词器,translog,refresh,search_after,scroll,脑裂,ES与MySQL对比
---

Elasticsearch（ES）是一个基于 **Lucene** 构建的**分布式、RESTful 风格的全文搜索引擎**，用 Java 编写，支持海量数据的近实时（NRT）搜索、聚合分析与高可用部署。它被广泛用于**站内搜索、日志分析（ELK）、业务检索、推荐与搜索型 BI** 等场景。

面试考察 ES，一般从三条主线展开：**索引原理**（倒排索引凭什么快）、**分布式原理**（分片/副本/集群如何保证扩展性与高可用）、**使用与调优**（DSL、聚合、深分页、性能优化）。本文按这三条主线系统梳理。

## 一、核心概念

### 1.1 索引（Index）、文档（Document）、字段（Field）

- **索引（Index）**：存放结构相同的一类文档的逻辑容器，类似关系型数据库中的"表"。索引名必须小写。
- **文档（Document）**：ES 中可搜索的最小数据单元，以 JSON 对象表示，类似数据库中的"行"。
- **字段（Field）**：文档中的属性，类似数据库中的"列"。
- **映射（Mapping）**：定义字段的类型、分词器等元信息，类似数据库的"表结构（Schema）"。

```json
// 一个典型文档（商品信息）
{
  "name": "华为 Mate 60 Pro",
  "price": 6999,
  "category": "手机",
  "description": "卫星通话，超可靠玄武架构，昆仑玻璃"
}
```

> **ES 7.x 移除了多类型（Type）概念**：一个索引只能有 `_doc` 一个类型。原因：同一索引下多个类型的文档底层共享 Lucene 结构，映射冲突多、设计臃肿，移除后更简洁高效。

### 1.2 映射（Mapping）与分词

映射定义字段的行为，核心是 `type`（字段类型）与 `analyzer`（分词器）：

- **字段类型**：`text`（全文，需分词）、`keyword`（精确值，不分词）、`integer/long/double`（数值）、`date`、`boolean`、`object`、`nested`、`geo_point` 等。
- **分词器（Analyzer）**：把文本切分成词元（token）的组件。一个完整的 analyzer = **字符过滤器（Character Filter）+ 分词器（Tokenizer）+ 词项过滤器（Token Filter）**。
- **中文分词**：ES 默认的 `standard` 分词器对中文按单个汉字切分，效果差。中文场景常用 **IK 分词器**（ik_max_word 最细粒度 / ik_smart 最粗粒度）或 **HanLP**。

```bash
# 查看分词结果
POST _analyze
{
  "analyzer": "ik_max_word",
  "text": "华为手机真不错"
}
# 输出: 华为 / 手机 / 真不错 / 错 等词元
```

> **为什么 text 字段要分词？** 倒排索引的键是"词"，中文一句话要先拆成词，才能建立"词 → 文档"的映射，否则搜索"手机"就匹配不到"华为手机真不错"。

### 1.3 节点与集群角色

一个 ES 集群由多个节点组成，节点按职责可以划分为不同角色（`node.roles`）：

| 角色                     | 职责                                             | 说明                     |
| ------------------------ | ------------------------------------------------ | ------------------------ |
| Master（主节点）         | 集群元数据管理：索引创建、分片分配、集群状态维护 | 生产建议独立，不存数据   |
| Data（数据节点）         | 存储数据、执行写入与查询                         | 集群的主体               |
| Coordinating（协调节点） | 接收请求、路由到分片、聚合结果                   | 每个节点默认都有协调能力 |
| Ingest（预处理节点）     | 写入前的数据管道处理                             | 复杂管道场景可用         |
| ML / 机器学习节点        | 机器学习任务                                     | 高级功能                 |

## 二、倒排索引（核心中的核心）

### 2.1 正排索引 vs 倒排索引

- **正排索引（正向索引）**：以"文档"为维度，`文档ID → 内容`。搜索时只能逐文档扫描匹配，性能随文档量线性下降。
- **倒排索引（Inverted Index）**：以"词"为维度，`词 → 包含该词的文档ID列表`。搜索时先定位词，直接拿到文档列表，与文档总量基本无关。

```text
正向索引（按文档存）：
  doc1: 我喜欢 Java
  doc2: Java 真棒
  doc3: 我爱编程

倒排索引（按词存）：
  我   -> [doc1, doc3]
  喜欢 -> [doc1]
  Java -> [doc1, doc2]
  真棒 -> [doc2]
  爱   -> [doc3]
  编程 -> [doc3]
```

### 2.2 倒排索引的三层结构

倒排索引由三层结构组成，层层加速：

1. **词项字典（Term Dictionary）**：所有词的集合，按字典序排列，支持二分查找。数据量大时占内存。
2. **词项索引（Term Index）**：词项字典的前缀索引，Lucene 用 **FST（Finite State Transducer，有限状态转换器）** 实现，占用极小，常驻内存，用于**快速定位词在字典中的位置**。
3. **倒排列表（Posting List）**：每个词对应的**文档 ID 列表**（DocId），Lucene 使用 **FOR（Frame Of Reference，增量编码 + 位压缩）** 和 **Roaring Bitmap** 等压缩技术存储，还记录词频（TF）、位置（Position）、偏移（Offset）等信息，用于打分与短语查询。

```text
查找 "Java"：
  内存中的 FST（Term Index）定位到字典位置（毫秒级）
    ↓
  词项字典（Term Dictionary）确认词项
    ↓
  读取倒排列表 Posting List：[doc1, doc2]
```

> **为什么 ES 的全文检索快？** ① 倒排索引把"扫描全文"变成"查词定位"，复杂度与结果集相关而非与文档总量相关；② Term Index（FST）让词定位接近 O(1)；③ Posting List 高度压缩（FOR/Roaring Bitmap），读盘量极小；④ 分片并行 + 分布式聚合。

### 2.3 相关度评分：TF-IDF 与 BM25

搜索匹配后，ES 会给每个文档计算相关度 `_score` 并排序：

- **TF-IDF**：`词频（TF，词在文档中出现的次数）` × `逆文档频率（IDF，词越稀有权重越高）`。Lucene 经典打分模型。
- **BM25**：Lucene 6+ / ES 5+ 默认打分模型，在 TF-IDF 基础上引入了**词频饱和**（词频超过阈值后权重增长放缓）和**文档长度归一化**（长文档中词出现的次数要打折），效果更好。

## 三、分片与副本（分布式存储）

### 3.1 分片（Shard）与副本（Replica）

- **主分片（Primary Shard）**：数据的实际分片。一个索引被拆成多个主分片，分布在不同节点上，**创建索引时指定，之后不可修改数量**（因为分片数是路由算法的一部分）。
- **副本分片（Replica Shard）**：主分片的完整拷贝。
  - **高可用**：主分片所在节点宕机时，副本分片升级为主分片；
  - **读扩展**：查询可以在主分片和副本分片上并行执行。

```bash
# 创建索引：3 个主分片，每个 1 个副本
PUT /product
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1
  }
}
```

> **主分片数量为什么不能改？** 文档路由规则是 `shard = hash(routing) % number_of_shards`（默认 routing 为文档 ID），主分片数变了，同一个文档会被路由到不同分片，原有数据分布全部失效。**副本数可以随时调整**，主分片数不行。

### 3.2 数据路由

写入/查询某个文档时，需要确定它属于哪个分片：

```text
shard = hash(路由值) % 主分片数
```

- 默认路由值为**文档 ID**，保证同一文档永远落在同一分片；
- 也可以自定义路由值（`?routing=user_123`），让**同一用户的全部文档落在同一分片**，实现"分片内聚合"（例如按用户搜索其订单，避免跨分片查询）。

> **自定义 routing 的取舍**：路由合理能大幅提升查询性能（一次路由直接命中分片），但会造成分片数据不均衡，需要根据业务权衡。

### 3.3 分片分配与均衡

- Master 节点负责把分片分配到各个 Data 节点，默认尽量均衡（每个节点的分片数、主副本不落在同一节点）。
- 分配时考虑：节点磁盘水位（`cluster.routing.allocation.disk.watermark`）、节点过滤器（`_name`/`_ip`/`_attr`）、延迟分配（节点短暂离线不立即重分配）。
- **高可用原则：主分片与它的副本分片不能分配在同一节点**（否则该节点宕机时主副本一起丢）。

### 3.4 分片数怎么选？（高频面试题）

分片数的影响：

- **分片过多**：每个分片要消耗内存与文件句柄；跨分片查询（聚合所有分片结果再排序）开销大；分片数超过节点数太多时分配不均。
- **分片过少**：单分片数据量过大，检索与合并压力大；无法充分利用多节点并行能力。
- **经验值**：单分片数据量建议控制在 **30~50GB** 以内；分片总数 ≈ 节点数 × 每个节点可承担的分片数（一般每节点 20~50 个分片比较安全）；具体要结合数据量与写入吞吐评估。

## 四、集群高可用（主节点选举与脑裂）

### 4.1 Master 选举

- ES 基于 **Zen Discovery**（ES 7.x 前）或 **Quorum-based 集群协调**（ES 7.x 后，基于内部分布式共识）选举 Master。
- 只有具备 master 角色（`node.master: true`）的节点可以参与选举。
- 选举条件：节点数必须**超过半数**（法定人数 quorum = `master 候选节点数 / 2 + 1`），否则无法选举出 Master，集群不可用。

```yaml
# elasticsearch.yml
discovery.seed_hosts: ["node1", "node2", "node3"] # 候选节点
cluster.initial_master_nodes: ["node1", "node2", "node3"]
```

### 4.2 脑裂（Split Brain）与防脑裂

**脑裂**：网络分区后，原集群被分成多个"子集"，每个子集都选出了自己的 Master，导致集群元数据（分片分配、索引映射）各改各的，最终数据损坏。

**防脑裂配置（必须掌握）**：

```yaml
# 候选 master 节点数量（至少 3，建议奇数）
discovery.zen.minimum_master_nodes: 2
```

- 法定人数 = `候选 master 节点数 / 2 + 1`，如 3 个候选节点时配 2；
- 分区后，不足法定人数的子集无法选举 Master，只能作为从属节点跟随唯一合法的 Master；
- **节点数取奇数**（如 3、5），避免 2 个节点时法定人数恰好各占一半。

### 4.3 故障转移

- **节点宕机**：Master 通过探测发现节点失联，重新分配该节点上的副本分片（副本升级为主分片），并对缺失副本进行补齐。
- **分片恢复**：数据从副本或 translog 中恢复，期间分片处于恢复中状态（`initializing`/`recovering`），不可搜索但不会丢数据（有副本时）。

## 五、写入流程（近实时 NRT 的由来）

### 5.1 完整写入链路

```text
客户端
  ↓ 写请求（PUT /index/_doc/id）
协调节点（Coordinating）
  ↓ 路由：shard = hash(id) % 主分片数
主分片所在 Data 节点
  ↓ 写入 Lucene 内存缓冲（Index Buffer）
  ↓ 同时写入 translog（事务日志，落盘，保证不丢数据）
  ↓ 副本分片同步（同步成功才向客户端返回）
  ↓ 周期性 refresh（默认 1s）：内存缓冲 → segment 文件，可被搜索
客户端 ← 返回结果
```

各环节详解：

1. **路由**：协调节点计算文档所在主分片，转发请求。
2. **写入缓冲 + translog**：数据先进入 Lucene 的 **Index Buffer**（内存，不可搜索），同时写入 **translog**（磁盘上的事务日志）。translog 是 ES 数据不丢失的关键——即使宕机，也能从 translog 恢复尚未落盘的写入。
3. **同步副本**：主分片写入成功后，把请求转发给副本分片，副本写入成功才向客户端返回成功（默认 `wait_for_active_shards=1`，可配置为多数派）。
4. **refresh（近实时关键）**：默认每秒执行一次，把 Index Buffer 中的文档生成一个**不可变的 segment（段）文件**，此后新文档才能被搜索到。**这就是 ES"近实时"（NRT）的原因：写入后约 1 秒才可搜索**。
5. **flush（落盘）**：把 segment 真正 fsync 到磁盘、清空 translog 的过程。由 `flush` 触发或 translog 大小超过阈值时自动触发。
6. **merge（段合并）**：随着不断 refresh，segment 越来越多。后台线程会周期性把小的 segment 合并成大的，删除被标记为 deleted 的文档，优化检索性能并释放磁盘。合并是 IO 密集型操作，大段合并可能在高峰期造成 IO 压力。

> **可配置点**：`refresh_interval`（如日志场景可调成 30s 甚至 -1 关闭，换写入吞吐）；`translog` 同步策略（`index.translog.durability: async` 可提高吞吐但降低可靠性）。

### 5.2 更新与删除为什么不实时生效？

ES 中 **segment 是不可变的**，因此：

- **更新**：实际上是"新增一个文档 + 标记旧文档为 deleted"；
- **删除**：只是标记 deleted，**物理删除要等 segment merge 时真正清理**；
- 因此刚删除/更新的文档，短时间内在查询中仍可能以旧状态命中（取决于 refresh 与 merge 时机）。

## 六、查询流程（query then fetch）

### 6.1 两阶段查询

ES 搜索采用 **Query-Then-Fetch** 两阶段模型：

```text
阶段一：Query（查询阶段）
  协调节点把查询广播到所有相关分片（主/副本均可）
  → 每个分片本地执行查询，只返回"文档 ID + 评分"的局部结果
  → 协调节点合并所有局部结果，按 _score 排序，取出前 from+size 个
  ↓
阶段二：Fetch（取回阶段）
  协调节点根据最终排名的文档 ID，向对应分片发起取文档
  → 分片返回完整文档内容
  → 协调节点组装最终响应返回客户端
```

**要点**：

- Query 阶段各分片只返回局部 TopN，**分片数量越多，全局排序的精确性开销越大**；
- 深分页（from 很大）时，每个分片都要计算 from+size 个结果，协调节点聚合的数据量巨大，性能急剧下降——这就是深分页问题的根源。

### 6.2 查询 DSL

ES 的查询用 JSON 的 **Query DSL** 描述，核心分类：

| 类别     | 查询             | 说明                                                                                                               |
| -------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| 全文检索 | `match`          | 分词后匹配，返回相关度排序                                                                                         |
|          | `match_phrase`   | 短语匹配，要求词序一致                                                                                             |
|          | `multi_match`    | 多字段同时 match                                                                                                   |
| 精确匹配 | `term` / `terms` | 精确值匹配（**注意：keyword 字段用 term，text 字段用 match**）                                                     |
|          | `range`          | 范围查询（gt/gte/lt/lte）                                                                                          |
|          | `exists`         | 判断字段是否存在                                                                                                   |
| 复合查询 | `bool`           | `must`（必须满足，参与打分）/ `should`（至少满足其一）/ `must_not`（必须不满足）/ `filter`（必须满足，不参与打分） |
| 聚合     | `aggs`           | 分组统计（详见下文）                                                                                               |

```json
// 示例：查询价格在 1000~5000 的华为手机，过滤库存，按评分排序
GET /product/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "category": "手机" } },
        { "match": { "brand": "华为" } }
      ],
      "filter": [
        { "range": { "price": { "gte": 1000, "lte": 5000 } } },
        { "term": { "in_stock": true } }
      ]
    }
  }
}
```

### 6.3 查询上下文 vs 过滤上下文（重要考点）

- **查询上下文（query context）**：计算 `_score` 相关度，执行成本高；
- **过滤上下文（filter context）**：只判断是否匹配，**不计算评分**，结果会被**缓存**，执行成本低。

**实践原则**：能用 `filter` 的用 `filter`（如范围、状态、精确匹配），只有需要相关度排序的才放 `query`。

## 七、聚合分析（Aggregations）

聚合是 ES 分析能力的核心，三大类：

### 7.1 指标聚合（Metric）

```json
// 求平均价格、最高价
GET /product/_search
{
  "aggs": {
    "avg_price": { "avg": { "field": "price" } },
    "max_price": { "max": { "field": "price" } }
  }
}
```

常用：`avg`、`sum`、`min`、`max`、`cardinality`（去重计数）、`value_count`、`percentiles`。

### 7.2 桶聚合（Bucket）

```json
// 按品牌分组，统计每个品牌的商品数
GET /product/_search
{
  "size": 0,
  "aggs": {
    "by_brand": {
      "terms": { "field": "brand.keyword", "size": 10 },
      "aggs": {
        "avg_price": { "avg": { "field": "price" } }   // 桶内再求平均价
      }
    }
  }
}
```

常用：`terms`（分组）、`date_histogram`（按时间分桶）、`range`、`filter`。**注意：分桶字段通常用 `.keyword` 后缀（精确值），text 字段不能直接分桶。**

### 7.3 管道聚合（Pipeline）

基于其他聚合的结果再做计算，如 `avg_bucket`（对每个桶的平均值再求平均）、`percentiles_bucket`、`bucket_script`。常用于复杂的时序分析。

## 八、深分页问题与解决方案

### 8.1 为什么深分页慢？

`from + size` 的语义：每个分片都要计算并返回 `from + size` 条局部结果，协调节点要合并 `分片数 × (from + size)` 条记录再排序。`from` 越大，合并排序的开销越大（甚至撑爆堆内存）。**ES 默认限制 `from + size <= 10000`**（`index.max_result_window`）。

### 8.2 三种深分页方案对比

| 方案           | 原理                                         | 优点                   | 缺点                                               | 适用                       |
| -------------- | -------------------------------------------- | ---------------------- | -------------------------------------------------- | -------------------------- |
| `from + size`  | 全局排序后跳过前 from 条                     | 支持跳页               | 深分页内存开销大，默认上限 1w                      | 浅分页（如 < 1000）        |
| `scroll`       | 生成一次性的**快照游标**，分批取完           | 适合全量导出           | 快照期间数据不更新（旧数据）；占用资源，用完需清理 | 导出数据、后台批量处理     |
| `search_after` | 用**上一页最后一条的排序值**作为游标继续翻页 | 支持实时数据、性能稳定 | **不支持随机跳页**（只能一页页往下翻）             | 前端"加载更多"场景（推荐） |

```json
// search_after 示例：以 _id 为稳定排序，翻页时带上上一页最后一条的值
GET /product/_search
{
  "size": 10,
  "sort": [{ "_id": "asc" }],
  "search_after": ["product_12345"]   // 上一页最后一条的排序字段值
}
```

> **面试加分点**：搜索引擎交互（"加载更多"）用 search_after；"上一页/下一页"跳页需求如果必须支持，需要在业务层记录每页的 search_after 值（本质是锚点翻页）。

## 九、ES 与关系型数据库对比

### 9.1 术语对照

| 关系型数据库    | Elasticsearch           |
| --------------- | ----------------------- |
| 数据库 Database | 索引 Index              |
| 表 Table        | 类型 Type（7.x 已移除） |
| 行 Row          | 文档 Document           |
| 列 Column       | 字段 Field              |
| 表结构 Schema   | Mapping 映射            |
| SQL             | Query DSL               |

### 9.2 ES 适合什么、不适合什么？

- **适合**：全文检索、模糊/分词搜索、复杂聚合分析、日志检索、海量数据近实时检索。
- **不适合**：强事务（ACID）、频繁单点更新、复杂多表关联（JOIN 能力弱，需反范式设计）、对数据一致性要求极高的核心交易数据。

> **实践**：ES 通常作为**检索层**与关系型数据库（MySQL）搭配使用——MySQL 存事实数据保证事务与一致，ES 存检索字段提供搜索与聚合。二者靠同步机制保持数据一致。

### 9.3 如何保证 ES 与 MySQL 数据一致性？（高频）

常见三种方案：

1. **双写**：应用写完 MySQL 再写 ES。简单直接，但两处写入可能失败造成不一致，需要**补偿/对账机制**。
2. **MQ 异步同步**：应用只写 MySQL，同时发一条 MQ 消息，消费者把数据同步到 ES。解耦、削峰，配合重试可保证最终一致。**生产最常用**。
3. **Binlog 订阅（Canal）**：Canal 监听 MySQL Binlog，把增量变更转发给 ES。对应用**完全无侵入**，但需要维护 Canal 组件。

详见 [MySQL 同步 ES 方案详解](/database/mysql/mysql-to-elasticsearch-sync.html)。

## 十、性能优化与运维实践

### 10.1 JVM 堆内存

- 堆内存不要超过物理内存的 **50%**（ES 默认 `-Xmx1g`，建议不超过 30~31GB）；
- 剩下的内存留给 **OS 文件缓存**——Lucene 重度依赖 OS 页缓存做文件读取，文件缓存命中率直接决定检索性能。

### 10.2 Segment 与合并

- 定期清理不必要的数据（如日志按时间滚动删除索引）；
- 用 `forcemerge` 强制合并只读索引（如历史归档索引），减少 segment 数；
- 关注 `merge` 线程的 IO 压力，高峰期可调低并发。

### 10.3 分片与写入优化

- 合理分片数（见上文），避免单分片过大或分片过多；
- 大批量写入时：调大 `refresh_interval`、关闭副本（写完再开，配合 reindex）、使用 bulk 批量写入；
- 避免频繁更新/删除（segment 不可变，更新 = 新增 + 标记删除）。

### 10.4 查询优化

- 多用 `filter`（可缓存）少用 `query`；
- 避免 `wildcard` 前导通配（`*abc`）与过深的 `nested` 查询；
- 慢查询排查：开启慢日志（`index.search.slowlog`），用 `_profile` API 分析查询耗时分布。

## 十一、面试高频问题速查

1. 什么是倒排索引？为什么快？（分层结构 + FST + 压缩）
2. 正排索引与倒排索引的区别？
3. ES 的写入流程？（路由 → 主分片 → translog → refresh → 副本）
4. 为什么 ES 是"近实时"的？（默认 1s refresh）
5. translog 是干什么的？（防止写入丢失）
6. 主分片数量为什么创建后不能改？（路由算法）
7. 副本分片的作用？（高可用 + 读扩展）
8. 什么是脑裂？如何防止？（minimum_master_nodes = 半数+1）
9. 深分页为什么慢？scroll 和 search_after 的区别？
10. term 和 match 的区别？（term 不分词精确匹配 keyword；match 分词匹配 text）
11. query 和 filter 的区别？（打分与缓存）
12. ES 的 mapping 中 text 和 keyword 的区别？
13. ES 与 MySQL 有什么区别？如何保证一致性？
14. ES 集群有哪些节点角色？
15. 分片数怎么选？
16. 更新和删除为什么不实时？（segment 不可变）
17. 聚合分几种？terms 聚合为什么常用 `.keyword` 后缀？

## 相关文章

- [MySQL 同步 ES 方案](/database/mysql/mysql-to-elasticsearch-sync.html)
- [搜索引擎相关书籍](/books/search-engine.html)
- [MySQL 索引失效问题](/database/mysql/mysql-index-invalidation.html)

## 参考

- Elasticsearch 官方文档：<https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html>
- 《Elasticsearch 权威指南》
- 《深入理解 Elasticsearch》
