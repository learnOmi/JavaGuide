---
title: Redis集群详解
description: Redis集群与高可用方案详解，包括主从复制（全量/增量同步、PSYNC协议）、Redis Sentinel哨兵模式（主观/客观下线、故障转移、脑裂）、Redis Cluster分片集群（哈希槽、Gossip通信、MOVED/ASK重定向、扩缩容）的原理、配置与面试高频问题。
category: 数据库
tag:
  - Redis
head:
  - - meta
    - name: keywords
      content: Redis集群,Redis Cluster,Redis Sentinel,主从复制,哨兵模式,分片集群,高可用,PSYNC,哈希槽,Gossip协议,故障转移,脑裂,16384
---

Redis 作为一款高性能的内存数据库，单机在数据量、写入吞吐和可用性上都存在硬上限。生产环境通常以**集群**方式部署来保证**高可用（HA）**、**高吞吐**与**可扩展性**。Redis 官方的集群/高可用方案按演进路径主要有三种：**主从复制（Replication）**、**Sentinel 哨兵模式**、**Cluster 分片集群**。

本文从这三个层次由浅入深梳理 Redis 集群的完整知识体系，涵盖底层原理、协议细节、配置实践与面试高频问题，帮助你系统回答"Redis 如何保证高可用""Redis 集群如何分片、如何容灾""主从复制与哨兵/集群有什么区别"等问题。

## 为什么单机 Redis 不够用？

先明确单机 Redis 的三个核心瓶颈，这也是后面所有方案的出发点：

1. **单点故障**：机器宕机或 Redis 进程异常退出，服务直接不可用，数据只能靠持久化文件恢复，恢复期间业务中断。
2. **读写瓶颈**：Redis 是单线程执行命令（指命令处理线程，Redis 6.0 之后网络 IO 可多线程），单实例 QPS 大约在 10w 量级，写能力受限于单核。
3. **容量上限**：数据全部驻留内存，单机内存有限（一般建议单实例不超过 10GB 左右，避免持久化和 fork 开销过大），海量数据单机装不下。

三套方案分别解决不同层次的诉求：主从复制解决**单点故障与读写分离**，Sentinel 在主从之上解决**自动故障转移**，Cluster 进一步解决**容量与写入的水平扩展**。

## 主从复制（Replication）

### 主从复制解决了什么问题？

主从复制是 Redis 高可用的基础，也是最简单的一种部署形态：

- 一个 **Master（主节点）** 可以有多个 **Slave（从节点）**，Slave 实时复制 Master 的数据，保证数据冗余。
- **读写分离**：读操作可以分摊到多个 Slave 上，减轻 Master 压力；写操作只能走 Master，再异步同步给 Slave。
- **数据备份与故障兜底**：Master 数据丢失时，可以从 Slave 恢复；Master 宕机后（短暂不可用可接受）可手动把某个 Slave 提升为新的 Master。

```bash
# 方式一：slaveof 命令（临时生效，重启后失效）
127.0.0.1:6380> SLAVEOF 127.0.0.1 6379
OK

# 方式二：配置文件（持久生效）
# redis-6380.conf
slaveof 127.0.0.1 6379
slave-read-only yes
```

> 注意：`slaveof` 在较新版本中已被 `replicaof` 取代，语义完全一致。

### 主从复制的核心原理

主从复制的本质是：**Slave 启动后向 Master 发起同步，Master 把数据全量交给 Slave，之后把新增的写命令源源不断地推送给 Slave**。具体分为两个阶段：

#### 1. 全量同步（Full Resynchronization）

触发场景：Slave 第一次连接 Master、或复制中断太久导致增量同步不可用。

流程（Redis 2.8+，基于 `PSYNC` 命令）：

1. Slave 向 Master 发送 `PSYNC ? -1`（`?` 表示不知道自己所属的复制历史，`-1` 表示偏移量为 -1），请求全量复制。
2. Master 在后台执行 `BGSAVE` 生成 RDB 快照，同时用**复制积压缓冲区（replication backlog）**记录接下来收到的写命令。
3. Master 把 RDB 文件完整发送给 Slave，Slave 收到后**清空旧数据**并加载 RDB。
4. Master 把复制积压缓冲区中累积的新增写命令发给 Slave，Slave 执行这些命令，最终与 Master 状态一致。

::: warning 全量同步的开销
全量同步代价很高：Master 需要 fork 子进程生成 RDB（fork 在内存大时会阻塞主线程）、占用网络带宽传输整个数据集、Slave 加载期间会清空自己已有数据。所以应尽量避免频繁的全量同步。
:::

#### 2. 增量同步（Partial Resynchronization）

触发场景：复制链路短暂中断后重连（如网络抖动、Slave 重启），且中断期间的写命令仍保留在 Master 的复制积压缓冲区中。

流程：

1. Slave 重连后发送 `PSYNC <replid> <offset>`，带上自己记录的复制 ID 和已同步的复制偏移量。
2. Master 检查：
   - `replid` 是否与自己的复制 ID 一致；
   - Slave 上报的 `offset` 之后的数据是否仍在复制积压缓冲区中（`offset` 是否落后于 Master 但未超出缓冲区范围）。
3. 满足条件 → 返回 `+CONTINUE`，只把缺失的那一段写命令推送给 Slave，完成增量同步。
4. 不满足条件（replid 变了，或 offset 已经超出缓冲区）→ 返回 `+FULLRESYNC`，退化为全量同步。

#### 3. 同步传播（Command Propagation）

同步完成之后，Master 每执行一条写命令，都会把命令**传播**给所有 Slave：Master 把命令写入复制积压缓冲区，同时通过主从之间的连接推送给 Slave 执行。这条链路是**异步**的——Master 不会等 Slave 确认，所以 Slave 的数据在任意时刻都可能滞后于 Master，这种异步性也是"主从不一致"和"脑裂丢数据"问题的根源。

#### 4. 复制 ID（replid）与偏移量（offset）

- **replid（复制 ID）**：标识一段复制的历史。每个 Master 启动时会生成一个 40 位的随机 replid。Slave 会继承 Master 的 replid。当 Slave 晋升为 Master 或 Master 重启后 replid 变化，表示复制历史断了，需要重新全量同步。
- **offset（复制偏移量）**：Master 和 Slave 各自维护一个字节级偏移量，表示自己已处理的命令流位置。偏移量是判断增量同步可行性的关键。

#### 5. 复制积压缓冲区（Replication Backlog）

Master 维护一个固定大小的环形缓冲区（默认 1MB，由 `repl-backlog-size` 配置），用来缓存最近执行的写命令。Slave 断线重连后，Master 通过对比 offset 判断缺失的命令是否还在缓冲区内，决定能否增量同步。

> **注意**：复制积压缓冲区**不是为从节点复制准备的**，它的设计初衷是让从节点断开重连后能快速恢复（增量同步），避免每次断线都要全量复制。缓冲区大小要根据"网络中断平均时长 × 写入速率"来估算，太小会导致频繁全量同步。

### PSYNC 协议的演进

- **Redis 2.8 之前**：只有 `SYNC` 命令，断线重连只能全量复制，代价极高。
- **Redis 2.8+**：引入 `PSYNC` 支持增量同步，断线重连不再必然全量。
- **Redis 4.0+**：进一步引入 `PSYNC2`，支持**从节点晋升为主节点后，其他从节点能继续跟随新主节点进行增量同步**（旧版本中主从切换后其他从节点必须全量复制），并且部分解决跨版本重启导致的复制断裂问题。

### 无磁盘复制（Diskless Replication）

默认情况下全量同步要走"Master 生成 RDB 文件 → 落盘 → 读取文件 → 网络传输"两条路径。`repl-diskless-sync yes` 开启后，Master 把 RDB 直接通过 socket 流式传给 Slave，**不落盘**，减少一次磁盘 IO。适合磁盘慢、网络快的场景；代价是多个 Slave 同时全量同步时，Master 会等所有 Slave 就绪后一次性生成 RDB 并广播。

### 主从复制的常见拓扑

- **一主一从**：最简单的容灾形态。
- **一主多从**：读写分离，读能力扩展；但 Master 需要把命令传播给所有 Slave，Slave 越多 Master 的传播压力越大。
- **树状拓扑（级联复制）**：Slave 也可以有自己的从节点，形成树状结构，缓解 Master 的传播压力，但链路变长导致数据滞后更严重。

### 主从复制的局限

主从复制本身**不能实现自动故障转移**：Master 宕机后，需要人工把某个 Slave 提升为新的 Master，并修改客户端与所有 Slave 的配置。人工操作存在感知延迟和操作失误风险——这正是 Sentinel 要解决的问题。

## Sentinel 哨兵模式

### 什么是 Sentinel？

Redis Sentinel（哨兵）是一个**独立运行的分布式系统**，用于监控 Redis 主从实例，并在 Master 宕机时**自动完成故障转移**，把某个 Slave 提升为新的 Master。它是"运行在主从架构之上的管理节点"，自己不存业务数据。

Sentinel 的核心能力（官方文档归纳为四件事）：

1. **监控（Monitoring）**：持续检查 Master 和 Slave 是否运行正常。
2. **通知（Notification）**：某个被监控实例异常时，通过 API 通知系统管理员或上层应用。
3. **自动故障转移（Automatic failover）**：Master 不可用时，自动在 Slave 中选举一个提升为新 Master，并让其他 Slave 和新客户端重新指向新 Master。
4. **配置提供（Configuration provider）**：客户端连接 Sentinel 获取当前 Master 的地址，Master 切换后客户端能拿到新地址。

### Sentinel 是如何工作的？

#### 主观下线（SDOWN，Subjectively Down）

每个 Sentinel 以**每秒一次**的频率向它所监控的 Master、Slave、其他 Sentinel 发送 PING 心跳。若在 `down-after-milliseconds`（默认 30 秒）内持续未收到有效回复（PONG、LOADING、MASTERDOWN），该 Sentinel **单方面**认为该节点已下线——这只是"我看到的"结论，叫**主观下线**。

#### 客观下线（ODOWN，Objectively Down）

单个 Sentinel 的判断可能误判（例如网络分区导致心跳不通，但节点本身健康）。为了避免误判，Sentinel 会通过 `SENTINEL is-master-down-by-addr` 命令询问其他 Sentinel 对该 Master 的看法。当**足够多**（达到 `quorum`，如 2/3）的 Sentinel 都认为 Master 下线时，才会判定为**客观下线**，此时才允许触发故障转移。

> **为什么需要 quorum？** 单节点误判会引发不必要的切换，甚至造成脑裂（两个节点同时以 Master 身份对外服务）。quorum 机制用多数派投票消除误判，这是分布式系统"少数服从多数"思想的典型应用。

#### 故障转移（Failover）完整流程

1. **Leader 选举**：判定 Master 客观下线后，Sentinel 集群内部通过 **Raft 算法**投票选出一个 **Leader 哨兵**，由它负责执行故障转移（避免多个 Sentinel 同时切换互相干扰）。
2. **选择新 Master**：Leader 在现存 Slave 中按以下优先级选出一个数据最完整、最合适的从节点：
   - 过滤掉处于断线、超时等不健康状态的 Slave；
   - 过滤掉 `slave-priority` 为 0（约定 0 表示不参与选举）的 Slave；
   - 按 `slave-priority`（越小越优先，可自定义权重）排序；
   - 优先级相同则比较**复制偏移量（offset）**，offset 越大说明数据越新，越优先；
   - 仍相同则比较运行 ID，选择 ID 更小的。
3. **提升新 Master**：Leader 向选中的 Slave 发送 `SLAVEOF NO ONE`，使其从从节点变成主节点，停止复制旧 Master。
4. **其他 Slave 重新指向新 Master**：Leader 通知其余 Slave 执行 `SLAVEOF <新Master>`，改为复制新 Master。
5. **通知客户端与旧 Master**：更新自身对 Master 地址的记录，通知客户端"Master 已切换"；旧 Master 恢复后会被降级为从节点，复制新 Master（自动执行，无需人工）。

#### Sentinel Leader 选举：Raft 算法

Sentinel 之间选举 Leader 采用 **Raft 算法的简化实现**：

- 每个 Sentinel 有资格成为候选人，向其他 Sentinel 拉票；
- 采用"先到先得"原则，一个 Sentinel 在一个"任期"内只能投一票；
- 获得 **超过半数（N/2 + 1）** 票数的候选人成为 Leader，执行故障转移；
- 选举超时后仍未产生 Leader，则进入下一轮投票。

> 这也是为什么官方强烈建议部署 **奇数个** Sentinel 节点（至少 3 个）——多数派需要超过半数，2 个 Sentinel 在其中一个故障时无法形成多数，故障转移无法进行。

### 哨兵模式能防脑裂吗？

**不能完全防止，只能缓解。** 脑裂指网络分区后，旧 Master 仍在分区内独立工作、持续接收写入，同时新 Master 已被选举出来，造成同一段时间内有两个"Master"在写，分区恢复后旧 Master 的数据会被丢弃。

缓解手段是在 Master 上配置两项约束，让旧 Master 在"无法联系到多数 Sentinel / 从节点太少"时**拒绝写入**：

```bash
# 至少 1 个从节点存活且数据延迟不超过 10 秒，否则 Master 停止接受写请求
min-slaves-to-write 1
min-slaves-max-lag 10
```

当分区把旧 Master 与 Sentinel 集群割裂时，旧 Master 既联系不上多数 Sentinel（无法确认自己仍是合法 Master），从节点数据也拉不开，上述约束生效后旧 Master 会**拒绝写入**，从而把脑裂期间的脏写限制在极小范围。

> **关键理解**：即使有这些配置，Redis 主从复制的异步性质决定了**极端情况下仍可能丢数据**。如果业务对数据零丢失有硬性要求，需要配合 WAIT 命令、消息队列补偿或引入强一致存储（如 ZooKeeper/etcd 协调）等方案。

### Sentinel 部署建议

- **至少 3 个（奇数个）Sentinel 节点**，且与 Master 尽量分布在不同的机器/机架上，避免同机房故障导致哨兵集体失联。
- Sentinel 进程应**独立部署**，不要和 Redis 主从实例混部在关键节点上。
- 合理设置 `down-after-milliseconds`：过小容易误判，过大则故障切换慢。
- 客户端要使用 Sentinel 感知客户端（如 Jedis 的 `JedisSentinelPool`），才能在 Master 切换后自动获取新地址。

### Sentinel 配置示例

```bash
# sentinel.conf
port 26379
sentinel monitor mymaster 127.0.0.1 6379 2   # 监控名为 mymaster 的主节点，quorum=2
sentinel down-after-milliseconds mymaster 30000
sentinel failover-timeout mymaster 180000
sentinel parallel-syncs mymaster 1            # 故障转移时同时有几个从节点重新同步
```

启动：`redis-server sentinel.conf --sentinel`。

## Cluster 分片集群

### 为什么需要 Redis Cluster？

哨兵模式解决的是"一主多从"的高可用问题，但有两个根本限制：

1. **写入扩展性差**：所有写请求都集中在单个 Master 上，写吞吐受单机限制。
2. **容量受限**：数据总量受单机内存限制，无法水平扩容。

Redis Cluster（Redis 3.0 起提供，官方集群方案）通过**数据分片（Sharding）**把数据分散到多个主节点上，让容量和写入吞吐能够**水平扩展**——加机器就能扩容量、提吞吐，同时内置自动故障转移能力，兼具高可用。

### 数据分片：哈希槽（Hash Slot）

Redis Cluster 没有使用一致性哈希，而是采用**固定的 16384 个哈希槽**：

1. 集群被划分为 **16384 个哈希槽**（slot 0 ~ 16383）；
2. 每个主节点负责其中一部分连续/不连续的槽位（可通过 `CLUSTER ADDSLOTS` 手动分配，或用 `redis-cli --cluster create` 自动平均分配）；
3. 每个 key 通过公式 `CRC16(key) % 16384` 计算出属于自己的槽位；
4. 读写某个 key 时，客户端先计算出槽位，再定位到负责该槽位的节点。

```bash
# 计算 "JavaGuide" 这个 key 的槽位
127.0.0.1:6379> CLUSTER KEYSLOT JavaGuide
(integer) 10340
```

> **为什么用哈希槽而不是一致性哈希？** 一致性哈希的环空间很大、节点变更时 key 迁移范围不可控；哈希槽把空间固定切成 16384 份，节点增减时只需要迁移相应槽位，**迁移粒度可控、易于统计和运维**。槽位数量适中：既保证足够的分布粒度，又不会让节点间心跳包过大（详见下文"为什么是 16384"）。

### 为什么哈希槽是 16384 个？

这是社区公认的一个经典问题，核心权衡点是**节点间通信的心跳包大小**：

- Redis Cluster 的每个主节点会通过 Gossip 协议周期性地向其他节点发送 PING 心跳包，心跳包中需要携带**自己负责的槽位信息**。
- 槽位信息用**位图（bitmap）**表示：16384 个槽位 = 16384 bit = **2KB**。
- 如果槽位增加到 65536 个，位图就是 8KB；集群节点越多，每轮心跳传播的位图总量越大，网络开销明显上升。
- 另一方面，槽位数也不能太少（比如 1024），否则节点较少时单个节点承担的槽位过多，数据分布不均；且某些大 key 场景下分片粒度不够。

16384 是在"心跳通信开销、数据分布粒度、集群规模上限（官方建议节点数不超过 1000 左右）"之间权衡的结果。

### 集群节点如何通信？—— Gossip 协议

Redis Cluster 的节点之间通过 **Gossip（八卦）协议**交换信息，实现集群拓扑发现与故障感知：

- 每个节点维护一个集群状态视图（Cluster State），包含所有节点的信息。
- 节点间使用 **Cluster Bus**（一条独立的 TCP 端口，即普通端口 + 10000）通信，发送 **PING/PONG/MEET/FAIL** 等消息。
- 每个节点每秒随机挑选部分节点发送 PING，对方回 PONG；PING/PONG 消息中**携带一部分其他节点的状态信息**（Gossip 头中随机携带若干个节点的槽位、状态、IP 等）。
- 信息像病毒一样在整个集群中**传播**：任何节点的状态变化，最终会被所有节点感知到。**不需要全连接**，也能让每个节点掌握整个集群的状态。

> 关于 Gossip 的通用原理（传播模型、收敛性、与中心化协调的对比），可参考 [Gossip 协议详解](/distributed-system/protocol/gossip-protocol.html)。

```bash
# 查看集群信息
127.0.0.1:6379> CLUSTER INFO
cluster_state:ok
cluster_slots_assigned:16384
cluster_known_nodes:6
cluster_size:3

# 查看槽位分配
127.0.0.1:6379> CLUSTER SLOTS
1) 1) (integer) 0
   2) (integer) 5460
   3) 1) "127.0.0.1"
      2) (integer) 7001
   ...
```

### 客户端如何路由请求？—— MOVED 与 ASK 重定向

客户端不是集群成员，它只知道部分节点地址。当客户端把请求发给某个节点时：

- **槽位命中本节点**：直接处理并返回结果。
- **槽位不属于本节点**：返回 **MOVED 错误**，附带目标节点的地址。**智能客户端**（如 Jedis Cluster、Lettuce）会缓存这份"槽位 → 节点"映射，下次直接路由到正确节点。

```bash
> GET JavaGuide
(error) MOVED 10340 127.0.0.1:7002
```

在**扩容/缩容迁移槽位期间**，还会出现 **ASK 错误**：

- 槽位正在从节点 A 迁移到节点 B，A 已把部分 key 迁走。
- 请求落在 A 上但 key 已被迁走 → A 返回 **ASK 重定向**，让客户端先去 B 执行一次 `ASKING` 命令再请求。
- ASK 与 MOVED 的区别：**ASK 是临时性的**（只针对迁移中的个别 key，客户端不更新槽位映射），**MOVED 是永久性的**（槽位归属已改变，客户端要更新缓存映射）。

### 故障检测与自动故障转移

Cluster 的故障检测思路与 Sentinel 类似，但完全内建在集群节点中：

1. **疑似下线（PFAIL）**：节点 A 在 `cluster-node-timeout`（默认 15 秒）内持续联系不上节点 B，A 标记 B 为 PFAIL（类似主观下线）。
2. **确认下线（FAIL）**：A 通过 Gossip 把 B 的 PFAIL 状态广播出去，若**大多数持有槽位的主节点**都认为 B 下线，则 B 被标记为 FAIL（类似客观下线）。
3. **从节点晋升**：B 的某个从节点发现 B 已 FAIL 后，先自我延迟一小段随机时间（避免多个从节点同时发起竞选），然后向集群内主节点发起 **FAILOVER 投票**，获得超过半数主节点投票后晋升为新主节点，并接管 B 的槽位。
4. **新主广播**：新主节点通过 Gossip 广播自己接管了槽位，客户端通过 MOVED 重定向逐步感知新节点。

**如果没有从节点怎么办？** 主节点 FAIL 后其槽位暂时不可用，集群状态变为 `cluster_state:fail`，对外拒绝服务（可通过 `cluster-require-full-coverage no` 让集群在部分槽位不可用时继续服务，但会有数据不一致风险）。

### 扩容与缩容（Resharding）

Redis Cluster 支持**在线**添加/移除节点，核心操作就是**槽位迁移**：

```bash
# 添加节点（空节点加入集群）
redis-cli --cluster add-node 127.0.0.1:7006 127.0.0.1:7001

# 把一个节点上的一部分槽位迁移到另一个节点（交互式指定槽位范围）
redis-cli --cluster reshard 127.0.0.1:7001
```

槽位迁移的实际流程（由 `redis-cli --cluster reshard` 或第三方工具驱动）：

1. 目标节点发送 `CLUSTER SETSLOT <slot> IMPORTING`，源节点发送 `CLUSTER SETSLOT <slot> MIGRATING`。
2. 源节点把该槽位下的 key 逐个用 `MIGRATE` 命令迁移到目标节点（MIGRATE 是原子操作，一个 key 迁移期间客户端读不到中间态）。
3. key 全部迁移完后，广播 `CLUSTER SETSLOT <slot> NODE <target>`，所有节点更新槽位归属，客户端收到 MOVED 后更新映射。

**迁移期间服务不中断**：迁移中的 key 通过 ASK 重定向保证读写正确性。**但要注意**：迁移大 key 时 `MIGRATE` 会阻塞源/目标节点的部分命令执行，大 key 迁移可能引发长时间阻塞甚至故障转移，生产环境要避免大 key 并控制迁移速率。

### Cluster 模式下的命令限制（重要）

分片带来的必然代价是**跨槽操作受限**：

- **多 key 命令**：`MGET`、`MSET`、`DEL` 等多个 key 如果分散在不同槽位，命令会直接报错（`CROSSSLOT`）；只有使用 **hash tag**（`{...}`，如 `user{123}.name`、`user{123}.age`）强制让相关 key 落入同一槽位，才能对它们执行多 key 操作。
- **事务/Lua 脚本**：`MULTI`/`EXEC` 事务和 Lua 脚本内的所有 key 也必须落在同一槽位。
- **管道（pipeline）**：管道中的多 key 命令同样受槽位限制。
- **单 key 大 value**：单个 key 只能存在一个节点上，超过单机内存的大 value 无法通过分片解决，需要拆分设计。

```bash
> MGET user:1:name user:1:age
(error) CROSSSLOT Keys in request don't hash to the same slot

> MGET user{1}:name user{1}:age   # 使用 hash tag
1) "JavaGuide"
2) "18"
```

### Cluster 集群搭建（快速示例）

```bash
# 以 6 个实例（3 主 3 从）为例，先分别启动 6 个 redis-server
# 每个实例配置文件开启：
#   cluster-enabled yes
#   cluster-config-file nodes-7001.conf
#   cluster-node-timeout 15000

# 一键创建集群：前 3 个为主，后 3 个为从
redis-cli --cluster create 127.0.0.1:7001 127.0.0.1:7002 127.0.0.1:7003 \
  127.0.0.1:7004 127.0.0.1:7005 127.0.0.1:7006 \
  --cluster-replicas 1
```

客户端连接：`redis-cli -c -p 7001`（`-c` 表示集群模式，自动处理重定向）。

### Cluster 的适用边界

- 适合**数据量大（GB~TB 级）、写入吞吐高、需要水平扩展**的场景。
- 不适合：需要跨槽事务/复杂 Lua 的业务（可考虑用 hash tag 规避）、单 key 超大 value、对数据强一致有硬性要求（集群故障转移期间，从节点可能滞后，写入可能丢失）。
- 官方建议集群节点数控制在 **1000 以内**，且不要把所有节点部署在同一物理机。

## 三种方案怎么选？

| 方案     | 解决的核心问题     | 写入扩展性 | 自动故障转移     | 数据分布   | 适用场景                                 |
| -------- | ------------------ | ---------- | ---------------- | ---------- | ---------------------------------------- |
| 主从复制 | 单点故障、读写分离 | 无（单写） | 无（需人工切换） | 全量冗余   | 数据量不大、可接受短暂人工干预、读多写少 |
| Sentinel | 主从自动故障转移   | 无（单写） | 有               | 全量冗余   | 中小规模、单写多读、可用性要求较高       |
| Cluster  | 容量与写入水平扩展 | 有（多写） | 有（内建）       | 哈希槽分片 | 大规模、高写入、需水平扩容               |

**选型建议**：

- 数据量小（单机内存能装下）→ 主从 + Sentinel 即可，成本低、运维简单。
- 数据量大或写吞吐高 → 直接上 Cluster，从设计上就按分片约束来（用 hash tag 规避跨槽问题）。
- 也可以在 Sentinel 模式下用**客户端分片/代理分片**（如 Twemproxy、Codis）做水平扩展，属于非官方方案，演进为 Cluster 是更稳妥的方向。

## 面试高频问题速查

**主从复制**

1. 主从复制的作用？复制过程是什么？（全量 + 增量 + 命令传播）
2. `SYNC` 与 `PSYNC` 的区别？什么时候触发全量、什么时候触发增量？
3. 全量同步和增量同步的流程分别是什么？
4. 复制积压缓冲区是做什么的？过大/过小会怎样？
5. 主从复制的延迟来源有哪些？如何优化（如 `repl-backlog-size`、网络优化、尽量同机房）？
6. 主从架构为什么会有数据不一致？读请求路由到 Slave 时如何兜底（如 `WAIT` 命令、读主库）？

**Sentinel**

7. Sentinel 的作用是什么？独立于 Redis 实例还是内嵌？
8. 主观下线与客观下线的区别？quorum 的作用？
9. 故障转移的完整流程？如何选出新 Master？
10. Sentinel 集群如何选出 Leader？（Raft）
11. 为什么推荐奇数个哨兵节点？
12. Sentinel 能完全防脑裂吗？`min-slaves-to-write` 的作用？

**Cluster**

13. 为什么需要 Cluster？与 Sentinel 的区别？
14. Cluster 如何分片？哈希槽是什么？为什么是 16384？
15. 如何计算一个 key 属于哪个槽？（CRC16 % 16384）
16. 什么是 hash tag？为什么需要它？
17. Cluster 节点之间如何通信？（Gossip / Cluster Bus）
18. MOVED 与 ASK 重定向的区别？
19. Cluster 如何实现故障转移？（PFAIL → FAIL → 从节点竞选）
20. Cluster 支持在线扩容缩容吗？迁移期间服务可用吗？
21. Cluster 模式下哪些操作受限？（跨槽多 key、事务、Lua）
22. 集群模式下大 key 会有什么问题？

## 相关文章

- [Redis 常见面试题总结（下）——集群/持久化/性能优化](/database/redis/redis-questions-02.html)
- [Redis 持久化机制详解](/database/redis/redis-persistence.html)：理解 RDB/AOF 是集群数据同步与恢复的基础
- [Redis 常见阻塞问题总结](/database/redis/redis-common-blocking-problems-summary.html)：全量同步、大 key 迁移等阻塞场景
- [Redis 3 种缓存读写策略详解](/database/redis/3-commonly-used-cache-read-and-write-strategies.html)
- [Gossip 协议详解](/distributed-system/protocol/gossip-protocol.html)：集群通信与分布式协调基础

## 参考

- 《Redis 设计与实现》（黄健宏）
- 《Redis 开发与运维》（付磊、张益军）
- Redis 官方文档：[Replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/)、[Sentinel](https://redis.io/docs/latest/operate/oss_and_stack/management/sentinel/)、[Cluster Specification](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/)
