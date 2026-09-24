---
title: 常见面试题自测清单
description: 常见面试题自测：按面试提问方式整理Java后端高频问题，每题给出提示与重要程度标注，覆盖Java基础、集合、并发、JVM、MySQL、Redis、Spring Boot、网络、操作系统、消息队列、系统设计与算法，适合面试前自测、定位短板、针对性复习。
category: 面试准备
icon: "mdi:shield-lock-outline"
head:
  - - meta
    - name: keywords
      content: 面试题自测,Java面试题,八股文自测,查缺补漏,面试复习,高频考点,Java后端面试
---

面试之前，强烈建议大家多拿常见的面试题来进行自测，检查一下自己的掌握情况，这是一种非常实用的备战技术面试的小技巧。

本文整理了 Java 后端面试高频考点自测清单。自测的核心方法是：**只看问题，不看答案和提示**，先在心里完整作答一遍，再对照提示和链接文档查漏补缺。重点关注标注 ⭐ 的高频考点——⭐ 越多，说明面试越爱问，就越值得多花一些时间准备。

## 自测方法

1. **按主题逐项自测**：先凭记忆作答，卡壳的地方就是你的短板。
2. **先自答再看提示**：提示只写了关键词和主线，用来检验你答得全不全，不要一上来就当答案背。
3. **对照文档查漏**：每题对应链接到 JavaGuide 的详细讲解，看完再复述一遍加深记忆。
4. **标记薄弱点**：把答不上来的题目单独记录，面试前重点回看。
5. **多次循环**：隔几天再来一轮自测，检验是否真正掌握。

## Java 基础自测

- ⭐⭐ String、StringBuilder、StringBuffer 的区别？`==` 与 `equals` 的区别？
  - 提示：String 不可变 + 常量池；StringBuilder 快但非线程安全；StringBuffer 方法加 `synchronized`。`==` 比引用/地址，`equals` 默认比引用、重写后比内容。
  - 参考：[Java 基础常见面试题（上）](/java/basis/java-basic-questions-01.html)
- ⭐⭐ 重载和重写的区别？抽象类与接口的区别？
  - 提示：重载是编译期（同名不同参），重写是运行期（子类覆盖，遵循"两同两小一大"）。抽象类单继承、可有构造器和字段；接口多实现，JDK 8 后可有 `default`/`static` 方法。
  - 参考：[Java 基础常见面试题（上）](/java/basis/java-basic-questions-01.html)
- ⭐⭐ Java 是值传递还是引用传递？
  - 提示：Java 只有值传递。传对象时传的是引用的副本——改引用指向不影响外层，改对象内容会生效。
  - 参考：[Java 值传递详解](/java/basis/why-there-only-value-passing-in-java.html)
- ⭐ 反射的优缺点与使用场景？
  - 提示：运行期获取类信息并操作（`Class`/`Field`/`Method`）；优点是灵活（框架、注解、动态代理），缺点是性能差、破坏封装、编译期无法检查。
  - 参考：[反射机制详解](/java/basis/reflection.html)
- ⭐ 深拷贝和浅拷贝的区别？
  - 提示：浅拷贝只复制一层，引用对象仍共享；深拷贝递归复制（或序列化/JSON 转换实现）。`Object.clone()` 默认是浅拷贝。
  - 参考：[Java 基础常见面试题（上）](/java/basis/java-basic-questions-01.html)
- ⭐ 异常体系：Error、Exception、RuntimeException 的区别？
  - 提示：Error 是 JVM 级严重问题（OOM、StackOverflow），不该 catch；Exception 分受检（必须处理）与非受检（`RuntimeException`）。`finally` 里不要写 `return`，会覆盖返回值。
  - 参考：[Java 基础常见面试题（下）](/java/basis/java-basic-questions-03.html)
- ⭐ 什么是泛型擦除？为什么不能 `new T[]`？
  - 提示：泛型只在编译期生效，运行时擦除为上界（默认 `Object`）；因此不能 `new T[]`、不能对泛型做 `instanceof`、静态方法不能用类的泛型参数。
  - 参考：[Java 基础常见面试题（中）](/java/basis/java-basic-questions-02.html)
- 什么是 SPI？和 API 的区别？
  - 提示：API 是调用方依赖实现方；SPI 是"接口在调用方、实现在被调用方"，靠 `META-INF/services`（JDK）或 `META-INF/dubbo`（Dubbo）加载，是框架可扩展的基础。
  - 参考：[SPI 机制详解](/java/basis/spi.html)

## 集合自测

- ⭐⭐ HashMap 的底层数据结构？put/get 流程？扩容机制？
  - 提示：数组 + 链表 + 红黑树；扰动函数 `h ^ (h >>> 16)`；`hash & (n - 1)` 定位下标；链表长度 ≥ 8 且容量 ≥ 64 才树化；扩容为 2 倍并按高位是 0/1 拆分。
  - 参考：[HashMap 源码详解](/java/collection/hashmap-source-code.html)
- ⭐⭐ HashMap 为什么线程不安全？ConcurrentHashMap 如何保证线程安全？
  - 提示：JDK 7 头插法扩容可能形成环，JDK 8 并发 `put` 可能丢数据；CHM 用 `CAS + synchronized` 锁单个桶、`size` 用 `CounterCell` 分散计数、多线程协助扩容。
  - 参考：[ConcurrentHashMap 源码详解](/java/collection/concurrent-hash-map-source-code.html)
- ⭐⭐ ArrayList 和 LinkedList 的区别？
  - 提示：动态数组 vs 双向链表；随机访问 `O(1)` vs `O(n)`；LinkedList 头插快、还实现了 `Deque`，但实际场景 ArrayList 更常用（内存连续、缓存友好）。
  - 参考：[Java 集合常见面试题（上）](/java/collection/java-collection-questions-01.html)
- ⭐ HashMap 的容量为什么是 2 的幂？负载因子为什么是 0.75？
  - 提示：2 的幂让 `hash & (n - 1)` 等价于取模且更快，扩容时元素只需判断高位；0.75 是空间利用率与冲突概率的经验折中。
  - 参考：[HashMap 源码详解](/java/collection/hashmap-source-code.html)
- ⭐ 什么是快速失败（fail-fast）？
  - 提示：迭代过程中 `modCount` 变化会抛 `ConcurrentModificationException`；删除元素要用 `iterator.remove()`；`CopyOnWriteArrayList` 属于安全失败。
  - 参考：[Java 集合常见面试题（下）](/java/collection/java-collection-questions-02.html)
- ⭐ 如何安全地遍历 Map 并删除元素？
  - 提示：用 `Iterator` + `remove()`、`entrySet().removeIf(...)`，或用 `ConcurrentHashMap`。**不要**在 for-each 里直接 `map.remove(key)`。
  - 参考：[Java 集合常见面试题（下）](/java/collection/java-collection-questions-02.html)
- ⭐ Comparable 和 Comparator 的区别？Java 的排序稳定吗？
  - 提示：`Comparable` 是自身可比较（`compareTo`，自然排序），`Comparator` 是外部比较器（可多个）；对象数组用 TimSort（稳定），基本类型数组用双轴快排（不稳定）。
  - 参考：[算法题常用集合操作总结](/cs-basics/algorithms/collection-api-for-algorithms.html)

## 并发自测

- ⭐⭐ 进程和线程的区别？为什么用多线程？
  - 提示：进程是资源分配单位、线程是调度单位；线程共享进程内存、切换开销更小；多线程用来提升 CPU 利用率与响应速度。
  - 参考：[Java 并发常见面试题（上）](/java/concurrent/java-concurrent-questions-01.html)
- ⭐⭐ synchronized 和 ReentrantLock 的区别？
  - 提示：前者是 JVM 关键字、自动释放、非公平；后者是 API、需手动 `unlock`（放 `finally`）、支持公平锁/可中断/超时/多条件变量。
  - 参考：[Java 并发常见面试题（中）](/java/concurrent/java-concurrent-questions-02.html)
- ⭐⭐ 线程池的核心参数？拒绝策略有哪些？
  - 提示：核心/最大线程数、空闲存活时间、时间单位、工作队列、线程工厂、拒绝策略；提交顺序是核心线程 → 队列 → 最大线程 → 拒绝。四种策略：Abort、CallerRuns、Discard、DiscardOldest。
  - 参考：[Java 线程池详解](/java/concurrent/java-thread-pool-summary.html)
- ⭐⭐ volatile 的作用？能否保证原子性？
  - 提示：保证可见性 + 禁止指令重排（内存屏障）；**不保证原子性**，`i++` 依然不安全，需要 `AtomicInteger` 或加锁。
  - 参考：[Java 并发常见面试题（中）](/java/concurrent/java-concurrent-questions-02.html)
- ⭐ ThreadLocal 的原理与内存泄漏问题？
  - 提示：每个 `Thread` 持有 `ThreadLocalMap`，key 是弱引用、value 是强引用；key 被回收后 value 无法访问造成泄漏，用完必须 `remove()`（线程池场景尤其重要）。
  - 参考：[ThreadLocal 详解](/java/concurrent/threadlocal.html)
- ⭐ AQS 的原理？
  - 提示：`volatile state` + CLH 双向队列；独占（`ReentrantLock`）与共享（`Semaphore`、`CountDownLatch`）两种模式；`tryAcquire`/`tryRelease` 由子类实现。
  - 参考：[Java 并发常见面试题（中）](/java/concurrent/java-concurrent-questions-02.html)
- ⭐ 什么是 CAS？它有什么问题？
  - 提示：比较并交换，依赖硬件原子指令；问题是 ABA（用版本号或 `AtomicStampedReference`）、自旋开销大、只能保证单个变量的原子性。
  - 参考：[Java 并发常见面试题（中）](/java/concurrent/java-concurrent-questions-02.html)
- ⭐ 线程池参数怎么设置？
  - 提示：CPU 密集型 ≈ 核数 + 1；IO 密集型可以更高（经验值 2×核数，或按 `QPS × 单次耗时` 估算）；关键是别用无界队列，并配好监控和拒绝策略。
  - 参考：[Java 线程池最佳实践](/java/concurrent/java-thread-pool-best-practices.html)

## JVM 自测

- ⭐⭐ JVM 内存区域划分？哪些是线程私有/共享的？
  - 提示：程序计数器、虚拟机栈、本地方法栈是线程私有；堆、方法区（JDK 8 后为元空间）是线程共享。
  - 参考：[JVM 内存区域详解](/java/jvm/memory-area.html)
- ⭐⭐ 如何判断对象是否可被回收？GC Roots 有哪些？
  - 提示：可达性分析；GC Roots 包括虚拟机栈中引用的对象、静态变量、常量、JNI 引用、活动线程等。
  - 参考：[JVM 垃圾回收详解](/java/jvm/jvm-garbage-collection.html)
- ⭐⭐ 类加载过程？双亲委派模型？
  - 提示：加载 → 验证 → 准备 → 解析 → 初始化；双亲委派保证核心类不被篡改、避免重复加载；破坏场景有 SPI、OSGi、热部署。
  - 参考：[类加载过程详解](/java/jvm/class-loading-process.html)
- ⭐ 常见 GC 算法与收集器？
  - 提示：标记-清除（有碎片）、标记-复制（新生代）、标记-整理（老年代）；收集器有 CMS、G1、ZGC，选型看停顿目标。
  - 参考：[JVM 垃圾回收详解](/java/jvm/jvm-garbage-collection.html)
- ⭐ 内存泄漏和内存溢出的区别？
  - 提示：泄漏是对象不再使用却无法回收（静态集合持有、未 `remove` 的 ThreadLocal、未关闭的资源）；溢出是内存真的不够用。泄漏长期累积会导致溢出。
  - 参考：[JVM 垃圾回收详解](/java/jvm/jvm-garbage-collection.html)
- ⭐ 线上 OOM 或 CPU 飙高怎么排查？
  - 提示：常用参数 `-Xms/-Xmx/-XX:+HeapDumpOnOutOfMemoryError`；工具 `jps`、`jstat`、`jmap`、`jstack`、MAT、Arthas；CPU 高先 `top -Hp` 找线程再 `jstack` 定位栈。
  - 参考：[JVM 参数详解](/java/jvm/jvm-parameters-intro.html)、[Java 后端线上问题排查](/java/jvm/jvm-in-action.html)

## MySQL 自测

- ⭐⭐ 索引底层数据结构为什么选 B+ 树？
  - 提示：树矮胖、磁盘 IO 次数少；叶子节点用链表串起来便于范围查询；非叶子节点只存索引不存数据，单页能放更多键。
  - 参考：[MySQL 索引详解](/database/mysql/mysql-index.html)
- ⭐⭐ 事务的四大特性？隔离级别有哪些？
  - 提示：ACID；读未提交、读已提交、可重复读（MySQL 默认）、串行化；分别对应脏读、不可重复读、幻读问题。
  - 参考：[MySQL 事务隔离级别详解](/database/mysql/transaction-isolation-level.html)
- ⭐⭐ 什么情况下索引会失效？
  - 提示：列上做函数或运算、隐式类型转换、以 `%` 开头的模糊查询、不满足最左前缀、范围查询之后的列、`or` 连接非索引列。
  - 参考：[MySQL 索引失效详解](/database/mysql/mysql-index-invalidation.html)
- ⭐⭐ MVCC 的实现原理？
  - 提示：隐藏列（`trx_id`、`roll_pointer`）+ undo log 版本链 + ReadView；RC 每次查询都生成 ReadView，RR 只在首次查询生成。
  - 参考：[InnoDB 的 MVCC 实现](/database/mysql/innodb-implementation-of-mvcc.html)
- ⭐ 一条 SQL 在 MySQL 中如何执行？
  - 提示：连接器 → 解析器 → 优化器 → 执行器 → 存储引擎；写操作涉及缓冲池与 redo log/binlog 的两阶段提交。
  - 参考：[SQL 执行流程详解](/database/mysql/how-sql-executed-in-mysql.html)
- ⭐ 行锁、间隙锁、临键锁的区别？
  - 提示：行锁锁住记录；间隙锁锁住区间（RR 下用来防幻读）；临键锁 = 行锁 + 间隙锁，是 RR 的默认加锁方式。
  - 参考：[MySQL 事务隔离级别详解](/database/mysql/transaction-isolation-level.html)
- ⭐ 分库分表怎么选？
  - 提示：先优化 SQL 和索引，再做读写分离，最后才考虑分库分表；垂直拆分按业务、水平拆分按数据；代价是分布式事务、跨库 join、全局唯一 ID。
  - 参考：[MySQL 常见面试题总结](/database/mysql/mysql-questions-01.html)

## Redis 自测

- ⭐⭐ Redis 为什么快？单线程模型是怎么回事？
  - 提示：纯内存操作、IO 多路复用、单线程免锁免上下文切换、高效数据结构（跳表、压缩列表、渐进式 rehash）；6.0 之后网络 IO 多线程，但命令执行仍是单线程。
  - 参考：[Redis 常见面试题总结（上）](/database/redis/redis-questions-01.html)
- ⭐⭐ Redis 持久化机制 RDB 和 AOF 的区别？
  - 提示：RDB 是快照，文件小、恢复快、可能丢数据；AOF 记录写命令，可配 `appendfsync`，更安全但文件大、恢复慢；4.0 后支持混合持久化。
  - 参考：[Redis 持久化机制详解](/database/redis/redis-persistence.html)
- ⭐⭐ 缓存穿透、击穿、雪崩的区别与解决方案？
  - 提示：穿透 = 查不存在的数据（布隆过滤器 + 缓存空值）；击穿 = 热点 key 失效（互斥锁 + 逻辑过期）；雪崩 = 大量 key 同时失效（过期时间加随机、多级缓存、熔断降级）。
  - 参考：[Redis 常见面试题总结（下）](/database/redis/redis-questions-02.html)
- ⭐⭐ Redis 集群方案：Sentinel 和 Cluster 的区别？
  - 提示：Sentinel 只做主从故障切换，写入仍是单点、数据不切片；Cluster 把数据分成 16384 个槽、支持多主写入，客户端靠 MOVED/ASK 重定向。
  - 参考：[Redis 集群详解](/database/redis/redis-cluster.html)
- ⭐ Redis 数据结构及典型应用场景？
  - 提示：String（计数、缓存）、Hash（对象）、List（队列、时间线）、Set（去重、共同好友）、ZSet（排行榜、延时任务）、Bitmap/HyperLogLog（统计）、Stream（消息队列）。
  - 参考：[Redis 数据结构详解](/database/redis/redis-data-structures-01.html)
- ⭐ 如何保证缓存与数据库的一致性？
  - 提示：Cache Aside——先更新数据库再删除缓存（或延迟双删）；强一致可订阅 binlog（Canal）异步刷新；不要采用"更新缓存"的写法。
  - 参考：[Redis 常见面试题总结（下）](/database/redis/redis-questions-02.html)
- ⭐ Redis 的过期策略和内存淘汰策略？
  - 提示：过期删除是惰性删除 + 定期随机抽查；淘汰策略共 8 种，常用 `allkeys-lru`、`volatile-lru`，`noeviction` 会在写满时直接报错。
  - 参考：[Redis 常见面试题总结（上）](/database/redis/redis-questions-01.html)

## Spring / Spring Boot 自测

- ⭐⭐ Spring 中 Bean 的生命周期？
  - 提示：实例化 → 属性填充 → Aware 回调 → `BeanPostProcessor` 前置 → 初始化方法 → 后置（AOP 代理在此生成）→ 使用 → 销毁。
  - 参考：[Spring 常见面试题总结](/system-design/framework/spring/spring-knowledge-and-questions-summary.html)
- ⭐⭐ 怎么理解 Spring 的 IOC 和 AOP？
  - 提示：IOC 是控制反转/依赖注入，对象的创建与依赖装配交给容器；AOP 是面向切面，把日志、事务等横切逻辑通过动态代理（JDK/CGLIB）织入。
  - 参考：[IOC 和 AOP 详解](/system-design/framework/spring/ioc-and-aop.html)
- ⭐⭐ Spring Boot 自动装配原理？
  - 提示：`@SpringBootApplication` 内含 `@EnableAutoConfiguration` → `AutoConfigurationImportSelector` 读取 `AutoConfiguration.imports` → 条件注解筛选 → 注册 Bean 定义。
  - 参考：[Spring Boot 自动装配原理详解](/system-design/framework/spring/spring-boot-auto-assembly-principles.html)
- ⭐⭐ Spring 事务传播行为有哪些？事务为什么会失效？
  - 提示：`REQUIRED`（默认）、`REQUIRES_NEW`、`NESTED`、`SUPPORTS`、`NOT_SUPPORTED`、`MANDATORY`、`NEVER`。失效场景：自调用、方法非 `public`、异常被吞、非运行时异常未配 `rollbackFor`、跨线程。
  - 参考：[Spring 事务详解](/system-design/framework/spring/spring-transaction.html)
- ⭐ Spring 怎么解决循环依赖？
  - 提示：三级缓存 + 提前暴露引用。只能解决单例 + setter/字段注入，构造器注入和原型 Bean 无法解决。
  - 参考：[Spring 常见面试题总结](/system-design/framework/spring/spring-knowledge-and-questions-summary.html)
- ⭐ `@Autowired` 和 `@Resource` 的区别？
  - 提示：`@Autowired` 按类型注入（Spring 提供），同类型多个时需要配 `@Qualifier`；`@Resource` 按名称注入（JSR-250 标准）。
  - 参考：[Spring 常见面试题总结](/system-design/framework/spring/spring-knowledge-and-questions-summary.html)

## 网络自测

- ⭐⭐ TCP 三次握手和四次挥手？为什么需要？
  - 提示：三次握手确认双方收发能力并同步初始序号；四次挥手是因为 TCP 全双工，被动关闭方收到 FIN 后可能还有数据要发，所以 ACK 和 FIN 分开发。
  - 参考：[TCP 连接与断开详解](/cs-basics/network/tcp-connection-and-disconnection.html)
- ⭐⭐ TCP 和 UDP 的区别？
  - 提示：面向连接/可靠/字节流 vs 无连接/不可靠/数据报；TCP 适合文件传输和 HTTP，UDP 适合直播、DNS、游戏。
  - 参考：[TCP 与 UDP 详解](/cs-basics/network/tcp-byte-stream-udp-datagram.html)
- ⭐⭐ HTTPS 如何保证安全传输？
  - 提示：用非对称加密安全地协商出对称密钥，再用对称加密传数据，靠证书校验服务端身份，整体由 TLS 握手完成。
  - 参考：[HTTP vs HTTPS](/cs-basics/network/http-vs-https.html)、[HTTPS 加密原理](/cs-basics/network/https-rsa-vs-ecdhe.html)
- ⭐ TCP 如何保证可靠传输？
  - 提示：序号 + 确认、超时重传、滑动窗口（流量控制）、拥塞控制（慢启动、拥塞避免、快重传、快恢复）。
  - 参考：[TCP 可靠性保证](/cs-basics/network/tcp-reliability-guarantee.html)
- ⭐ HTTP/1.0、HTTP/1.1、HTTP/2 的区别？
  - 提示：1.1 支持长连接与管道化；2 引入二进制分帧、多路复用、头部压缩（HPACK）、服务端推送，解决队头阻塞（应用层）。
  - 参考：[HTTP/1.0 vs HTTP/1.1](/cs-basics/network/http1.0-vs-http1.1.html)
- ⭐ 从输入 URL 到页面展示经历了什么？
  - 提示：DNS 解析 → TCP 握手 → TLS 握手 → 发 HTTP 请求 → 服务端处理 → 返回响应 → 浏览器解析渲染。
  - 参考：[从输入 URL 到页面展示到底发生了什么？](/cs-basics/network/the-whole-process-of-accessing-web-pages.html)

## 操作系统自测

- ⭐⭐ 进程和线程的区别？进程间通信方式有哪些？
  - 提示：资源分配单位 vs 调度单位；IPC 方式有管道、消息队列、共享内存、信号量、Socket，其中共享内存最快但需要自己处理同步。
  - 参考：[进程与线程详解](/cs-basics/operating-system/process-and-thread.html)
- ⭐⭐ 死锁的四个必要条件？如何避免？
  - 提示：互斥、请求并保持、不可剥夺、循环等待；破坏任一条件即可，工程上常用统一加锁顺序 + 加锁超时 + 事后检测。
  - 参考：[死锁详解](/cs-basics/operating-system/dead-lock.html)
- ⭐ 虚拟内存与分页机制？
  - 提示：逻辑地址经页表 + MMU 映射到物理地址，TLB 做缓存；缺页时触发缺页中断；页面置换常用 LRU、Clock。
  - 参考：[虚拟内存详解](/cs-basics/operating-system/virtual-memory.html)
- ⭐ IO 多路复用的 `select`、`poll`、`epoll` 有什么区别？
  - 提示：`select` 有 1024 fd 上限且需遍历；`poll` 去掉了上限但仍需遍历；`epoll` 用红黑树管理 fd + 就绪链表，只返回就绪的 fd，适合高并发。
  - 参考：[IO 多路复用详解](/cs-basics/operating-system/io-multiplexing.html)
- ⭐ 零拷贝是什么？
  - 提示：减少 CPU 拷贝次数和用户态/内核态切换，常见实现有 `mmap + write`、`sendfile`、`splice`；Kafka、Netty 都依赖它提升吞吐。
  - 参考：[零拷贝详解](/cs-basics/operating-system/zero-copy.html)

## 消息队列自测

- ⭐ 如何保证消息不丢失？
  - 提示：三段都要管——生产者开启确认（acks）、Broker 持久化并配置副本、消费者改为手动提交 offset 且处理成功后再提交。
  - 参考：[消息队列高频面试题](/high-performance/message-queue/message-queue-interview-questions.html)
- ⭐ 如何保证消息不被重复消费？
  - 提示：不要指望 MQ 不重复投递，要在消费端做幂等（唯一索引、去重表、Redis 记录消息 ID）。
  - 参考：[消息队列高频面试题](/high-performance/message-queue/message-queue-interview-questions.html)
- ⭐ 如何保证消息顺序？
  - 提示：把同一业务 key（如订单号）路由到同一分区/队列，并由单线程消费；跨分区无法保证全局有序，只能在业务侧排序。
  - 参考：[消息队列高频面试题](/high-performance/message-queue/message-queue-interview-questions.html)
- ⭐ 消息积压怎么处理？
  - 提示：先确认消费者是否卡死或异常；紧急扩容消费者、临时转发到新 topic 并行消费；事后排查是消费变慢还是生产突增。
  - 参考：[消息队列高频面试题](/high-performance/message-queue/message-queue-interview-questions.html)

## 系统设计 / 分布式自测

- ⭐⭐ 如何设计一个秒杀系统？
  - 提示：分层削峰——CDN + 前端限流 → 网关限流 → Redis 预扣库存（Lua 原子操作）→ MQ 异步下单 → 订单状态机 + 补偿。
  - 参考：[系统设计常见面试题总结](/system-design/system-design-questions.html)
- ⭐⭐ 分布式锁有哪些实现方案？
  - 提示：Redis（`SET NX EX` + Lua 校验释放，注意续期与主从切换）、ZooKeeper（临时顺序节点）、数据库（唯一索引/`for update`）；各有可用性与性能取舍。
  - 参考：[分布式锁常见实现方案](/distributed-system/distributed-lock-implementations.html)
- ⭐⭐ 接口幂等如何实现？
  - 提示：唯一索引/去重表、Token 机制、状态机、乐观锁、Redis `SETNX` 记录 requestId；幂等解决重复请求，锁解决并发互斥。
  - 参考：[接口幂等方案总结](/high-availability/idempotency.html)
- ⭐⭐ 服务限流怎么做？
  - 提示：算法有固定窗口、滑动窗口、漏桶、令牌桶（最常用，允许突发）；单机用 Guava/Sentinel，分布式用 Redis + Lua 或网关限流；被限流后可快速失败、排队或降级。
  - 参考：[服务限流详解](/high-availability/limit-request.html)
- ⭐ 分布式 ID 生成方案有哪些？
  - 提示：UUID（无序、不适合做主键）、数据库自增（性能与单点问题）、号段模式、Snowflake（时钟回拨问题）、Redis INCR。
  - 参考：[分布式 ID 生成方案详解](/distributed-system/distributed-id.html)
- ⭐ 分布式锁有哪些容易踩的坑？
  - 提示：业务没执行完锁就过期（续期/看门狗）、误删别人的锁（value 存唯一标识 + Lua 校验）、Redis 主从切换丢锁、可重入（`Redisson`）；最终一致性还要靠数据库约束兜底。
  - 参考：[分布式锁常见实现方案](/distributed-system/distributed-lock-implementations.html)
- ⭐ 怎么理解 CAP 和 BASE 理论？
  - 提示：CAP 指一致性、可用性、分区容错性三者不可同时满足（分区容错是必选项，实际是在 C 与 A 之间取舍）；BASE 是基本可用 + 软状态 + 最终一致，是 AP 的工程实践。
  - 参考：[分布式系统知识体系](/distributed-system/)

## 算法自测

- ⭐⭐ 常见排序算法的复杂度和稳定性？
  - 提示：快排 `O(nlogn)`、不稳定；归并 `O(nlogn)`、稳定；堆排 `O(nlogn)`、不稳定；冒泡/插入/选择是 `O(n²)` 级别（冒泡、插入稳定）。面试常要求手写快排与归并。
  - 参考：[十大经典排序算法](/cs-basics/algorithms/10-classical-sorting-algorithms.html)
- ⭐ 二分查找的边界怎么写不容易错？
  - 提示：统一用 `left <= right` 配 `mid = left + (right - left) / 2` 防溢出；找左边界时 `right = mid - 1`，注意循环退出后的越界判断。
  - 参考：[二分查找面试题总结](/cs-basics/algorithms/binary-search.html)
- ⭐ Top K 问题为什么用小顶堆？
  - 提示：堆里始终保留最大的 K 个元素，堆顶是这 K 个里最小的，新元素比堆顶大才替换；时间复杂度 `O(nlogk)`，空间 `O(k)`。
  - 参考：[Top K 问题面试题总结](/cs-basics/algorithms/top-k.html)
- ⭐ 手写 LRU 缓存的思路？
  - 提示：用 `LinkedHashMap` 的 `accessOrder = true` + 重写 `removeEldestEntry`；或手写 HashMap + 双向链表，把访问过的节点移到头部。
  - 参考：[LRU 缓存详解](/cs-basics/data-structure/lru-cache.html)
- ⭐ 算法题的容器与 API 怎么选？
  - 提示：计数用 `HashMap` 或数组、去重用 `HashSet`、栈/队列用 `ArrayDeque`、优先级用 `PriorityQueue`、有序区间查询用 `TreeMap`；注意 `Arrays.asList` 定长、`remove(int)` 与 `remove(Object)` 的区别。
  - 参考：[算法题常用集合操作总结](/cs-basics/algorithms/collection-api-for-algorithms.html)

## 自测后的查漏补缺

- [Java 后端面试重点总结（重要）](/interview-preparation/key-points-of-interview.md)
- [⭐Java 后端面试通关计划](/interview-preparation/backend-interview-plan.md)
- [如何高效准备 Java 面试？](/interview-preparation/teach-you-how-to-prepare-for-the-interview-hand-in-hand.md)
- [优质面经汇总](/interview-preparation/interview-experience.md)
- [Java 面试指北：复习主线与知识地图](/zhuanlan/java-mian-shi-zhi-bei.md)
- [后端高频系统设计&场景题（含答题要点）](/zhuanlan/back-end-interview-high-frequency-system-design-and-scenario-questions.md)
