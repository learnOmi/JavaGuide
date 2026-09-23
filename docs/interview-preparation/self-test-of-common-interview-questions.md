---
title: 常见面试题自测清单
description: 常见面试题自测：按面试提问方式整理Java后端高频问题，提供提示与重要程度标注，适合面试前自测、定位短板、针对性复习。
category: 面试准备
icon: "mdi:shield-lock-outline"
head:
  - - meta
    - name: keywords
      content: 面试题自测,Java面试题,八股文自测,查缺补漏,面试复习,高频考点,Java后端面试
---

面试之前，强烈建议大家多拿常见的面试题来进行自测，检查一下自己的掌握情况，这是一种非常实用的备战技术面试的小技巧。

本文整理了 Java 后端面试高频考点自测清单。自测的核心方法是：**只看问题，不看答案**，先在心里完整作答一遍，再对照链接文档查漏补缺。重点关注标注 ⭐ 的高频考点——⭐ 越多，说明面试越爱问，就越值得多花一些时间准备。

## 自测方法

1. **按主题逐项自测**：先凭记忆作答，卡壳的地方就是你的短板。
2. **对照文档查漏**：每题对应链接到 JavaGuide 的详细讲解，看完再复述一遍加深记忆。
3. **标记薄弱点**：把答不上来的题目单独记录，面试前重点回看。
4. **多次循环**：隔几天再来一轮自测，检验是否真正掌握。

## Java 基础自测

- ⭐ String、StringBuilder、StringBuffer 的区别？`==` 与 `equals` 的区别？→ [Java 基础常见面试题（上）](/java/basis/java-basic-questions-01.html)
- ⭐ 重载和重写的区别？抽象类与接口的区别？→ [Java 基础常见面试题（上）](/java/basis/java-basic-questions-01.html)
- ⭐ Java 是值传递还是引用传递？→ [Java 值传递详解](/java/basis/why-there-only-value-passing-in-java.html)
- ⭐ 反射的优缺点与使用场景？→ [反射机制详解](/java/basis/reflection.html)
- 什么是 SPI？和 API 的区别？→ [SPI 机制详解](/java/basis/spi.html)

## 集合自测

- ⭐ HashMap 的底层数据结构？put/get 流程？扩容机制？→ [HashMap 源码详解](/java/collection/hashmap-source-code.html)
- ⭐ HashMap 为什么线程不安全？ConcurrentHashMap 如何保证线程安全？→ [ConcurrentHashMap 源码详解](/java/collection/concurrent-hash-map-source-code.html)
- ⭐ ArrayList 和 LinkedList 的区别？→ [Java 集合常见面试题（上）](/java/collection/java-collection-questions-01.html)
- 什么是快速失败（fail-fast）？→ [Java 集合常见面试题（下）](/java/collection/java-collection-questions-02.html)

## 并发自测

- ⭐ 进程和线程的区别？为什么用多线程？→ [Java 并发常见面试题（上）](/java/concurrent/java-concurrent-questions-01.html)
- ⭐ synchronized 和 ReentrantLock 的区别？→ [Java 并发常见面试题（中）](/java/concurrent/java-concurrent-questions-02.html)
- ⭐ 线程池的核心参数？拒绝策略有哪些？→ [Java 线程池详解](/java/concurrent/java-thread-pool-summary.html)
- ⭐ volatile 的作用？能否保证原子性？→ [Java 并发常见面试题（中）](/java/concurrent/java-concurrent-questions-02.html)
- ThreadLocal 的原理与内存泄漏问题？→ [ThreadLocal 详解](/java/concurrent/threadlocal.html)

## JVM 自测

- ⭐ JVM 内存区域划分？哪些是线程私有/共享的？→ [JVM 内存区域详解](/java/jvm/memory-area.html)
- ⭐ 如何判断对象是否可被回收？GC Roots 有哪些？→ [JVM 垃圾回收详解](/java/jvm/jvm-garbage-collection.html)
- ⭐ 类加载过程？双亲委派模型？→ [类加载过程详解](/java/jvm/class-loading-process.html)
- JVM 常见参数与线上问题排查工具？→ [JVM 参数详解](/java/jvm/jvm-parameters-intro.html)、[Java 后端线上问题排查](/java/jvm/jvm-in-action.html)

## MySQL 自测

- ⭐ 索引底层数据结构为什么选 B+ 树？→ [MySQL 索引详解](/database/mysql/mysql-index.html)
- ⭐ 事务的四大特性？隔离级别有哪些？→ [MySQL 事务隔离级别详解](/database/mysql/transaction-isolation-level.html)
- ⭐ 什么情况下索引会失效？→ [MySQL 索引失效详解](/database/mysql/mysql-index-invalidation.html)
- 一条 SQL 在 MySQL 中如何执行？→ [SQL 执行流程详解](/database/mysql/how-sql-executed-in-mysql.html)
- MVCC 的实现原理？→ [InnoDB 的 MVCC 实现](/database/mysql/innodb-implementation-of-mvcc.html)

## Redis 自测

- ⭐ Redis 为什么快？单线程模型？→ [Redis 常见面试题总结（上）](/database/redis/redis-questions-01.html)
- ⭐ Redis 持久化机制 RDB 和 AOF 的区别？→ [Redis 持久化机制详解](/database/redis/redis-persistence.html)
- ⭐ 缓存穿透、击穿、雪崩的区别与解决方案？→ [Redis 常见面试题总结（下）](/database/redis/redis-questions-02.html)
- ⭐ Redis 集群方案：Sentinel 和 Cluster 的区别？→ [Redis 集群详解](/database/redis/redis-cluster.html)
- Redis 数据结构及应用场景？→ [Redis 数据结构详解](/database/redis/redis-data-structures-01.html)

## Spring/Spring Boot 自测

- ⭐ Spring 中 Bean 的生命周期？→ [Spring 常见面试题总结](/system-design/framework/spring/spring-knowledge-and-questions-summary.html)
- ⭐ Spring IOC 和 AOP 的理解？→ [IOC 和 AOP 详解](/system-design/framework/spring/ioc-and-aop.html)
- ⭐ Spring Boot 自动装配原理？→ [Spring Boot 自动装配原理详解](/system-design/framework/spring/spring-boot-auto-assembly-principles.html)
- Spring 事务传播行为有哪些？失效场景？→ [Spring 事务详解](/system-design/framework/spring/spring-transaction.html)

## 网络自测

- ⭐ TCP 三次握手和四次挥手？为什么需要？→ [TCP 连接与断开详解](/cs-basics/network/tcp-connection-and-disconnection.html)
- ⭐ TCP 和 UDP 的区别？→ [TCP 与 UDP 详解](/cs-basics/network/tcp-byte-stream-udp-datagram.html)
- HTTPS 如何保证安全传输？→ [HTTP vs HTTPS](/cs-basics/network/http-vs-https.html)、[HTTPS 加密原理](/cs-basics/network/https-rsa-vs-ecdhe.html)

## 系统设计/分布式自测

- ⭐ 如何设计一个秒杀系统？→ [系统设计常见面试题总结](/system-design/system-design-questions.html)
- ⭐ 分布式锁有哪些实现方案？→ [分布式锁常见实现方案](/distributed-system/distributed-lock-implementations.html)
- ⭐ 接口幂等如何实现？→ [接口幂等方案总结](/high-availability/idempotency.html)
- ⭐ 服务限流怎么做？→ [服务限流详解](/high-availability/limit-request.html)
- 分布式 ID 生成方案有哪些？→ [分布式 ID 生成方案详解](/distributed-system/distributed-id.html)

## 自测后的查漏补缺

- [Java 后端面试重点总结（重要）](/interview-preparation/key-points-of-interview.md)
- [⭐Java 后端面试通关计划](/interview-preparation/backend-interview-plan.md)
- [如何高效准备 Java 面试？](/interview-preparation/teach-you-how-to-prepare-for-the-interview-hand-in-hand.md)
- [优质面经汇总](/interview-preparation/interview-experience.md)
