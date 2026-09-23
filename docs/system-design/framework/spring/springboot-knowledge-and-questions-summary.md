---
title: SpringBoot常见面试题总结
description: SpringBoot核心面试题详解：自动配置原理、自定义Starter、配置加载顺序与优先级、启动流程、内嵌容器、读取配置方式、@Value与@ConfigurationProperties对比、异常处理、Actuator监控、Spring Boot与Spring Cloud关系。
category: 框架
tag:
  - Spring
head:
  - - meta
    - name: keywords
      content: Spring Boot面试题,SpringBoot原理,自动配置,Starter,配置文件,Actuator,SpringBoot常见问题,内嵌容器,启动流程,读取配置,异常处理,Spring Cloud
---

Spring Boot 是基于 Spring 的快速开发框架，核心价值在于 **自动装配（Auto-Configuration）**、**内嵌 Web 服务器** 和 **约定优于配置（Convention over Configuration）**。它让"启动一个可用的 Web 应用"从"写一堆配置"变成"加一个依赖、写一行代码"。本文系统梳理 Spring Boot 面试中的高频考点。

## 1. 什么是 Spring Boot？和 Spring 有什么区别？

- **Spring**：一个完整的生态框架，提供 IoC 容器、AOP、事务管理、MVC 等能力。但使用 Spring 搭建 Web 应用需要大量 XML/Java 配置、引入并协调大量依赖版本、手动部署 Web 容器（Tomcat）。
- **Spring Boot**：基于 Spring 的"再封装"，**没有取代 Spring 容器**，而是通过自动配置、起步依赖（Starter）、内嵌服务器把"能用"变成"开箱即用"。

| 对比维度   | Spring                 | Spring Boot                            |
| ---------- | ---------------------- | -------------------------------------- |
| 定位       | 基础框架/生态          | 基于 Spring 的快速开发框架             |
| 配置方式   | 大量 XML/注解手动配置  | 自动配置 + 少量配置项（约定优于配置）  |
| 依赖管理   | 手动引入并处理版本兼容 | Starter 起步依赖，版本由 Boot 统一管理 |
| Web 容器   | 外部部署 Tomcat 等     | 内嵌 Tomcat/Jetty/Undertow，一键启动   |
| 监控       | 需自己集成             | Actuator 开箱即用                      |
| 微服务支持 | —                      | 是 Spring Cloud 微服务体系的基础       |

## 2. 自动装配原理（必考）

### 2.1 @SpringBootApplication 的三重身份

```java
@SpringBootConfiguration   // 本质是 @Configuration，标记为配置类
@EnableAutoConfiguration   // 自动装配入口
@ComponentScan             // 扫描启动类所在包及其子包的组件
public @interface SpringBootApplication {}
```

### 2.2 自动装配的核心流程

```text
@EnableAutoConfiguration
  → @Import(AutoConfigurationImportSelector.class)
  → 读取 META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
      （Spring Boot 2.7+ 的自动配置类注册文件）
  → 得到全部候选自动配置类（几百个）
  → 条件注解（@ConditionalOnClass / @ConditionalOnMissingBean / @ConditionalOnProperty...）过滤
  → 按需加载满足条件的自动配置类
  → 自动配置类内部通过 @Bean 注册默认 Bean
```

### 2.3 条件注解如何实现"按需装配"？

| 条件注解                       | 判定内容              | 典型用法                                                   |
| ------------------------------ | --------------------- | ---------------------------------------------------------- |
| `@ConditionalOnClass`          | 类路径是否存在某类    | 引入 Redis 依赖才装配 `RedisAutoConfiguration`             |
| `@ConditionalOnMissingBean`    | 容器是否已存在某 Bean | 用户自定义了 `RedisTemplate`，默认的就不再装配             |
| `@ConditionalOnProperty`       | 配置项取值            | `@ConditionalOnProperty(prefix = "xxx", name = "enabled")` |
| `@ConditionalOnWebApplication` | 是否为 Web 环境       |                                                            |
| `@ConditionalOnExpression`     | SpEL 表达式           |                                                            |

> **一句话总结**：自动装配 = "读取所有候选配置 + 条件注解过滤 + 按需注册默认 Bean"。用户自定义 Bean 优先级更高（`@ConditionalOnMissingBean` 主动让位）。详细原理见 [Spring Boot 自动装配原理详解](/system-design/framework/spring/spring-boot-auto-assembly-principles.html)。

## 3. 如何自定义一个 Starter？

1. **编写自动配置类**：`@AutoConfiguration`（或 `@Configuration`）+ `@Bean` + 条件注解控制生效时机。
2. **注册自动配置类**：在 `src/main/resources/META-INF/spring/` 下创建 `org.springframework.boot.autoconfigure.AutoConfiguration.imports`，每行一个自动配置类全限定名。
3. **提供配置属性类**：`@ConfigurationProperties(prefix = "xxx")` 绑定配置项。
4. **（可选）排除组件扫描**：自动配置类与业务类分包（如 `xxx.autoconfigure`），避免被使用方的 `@ComponentScan` 误扫。

```java
// 1. 自动配置类
@AutoConfiguration
@EnableConfigurationProperties(MailProperties.class)
@ConditionalOnClass(MailSender.class)
public class MailAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    public MailSender mailSender(MailProperties properties) {
        return new MailSender(properties.getHost(), properties.getPort());
    }
}
```

```text
// 2. 注册文件 META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
com.example.mail.MailAutoConfiguration
```

## 4. 配置文件的加载顺序与优先级

### 4.1 优先级（从高到低）

```text
命令行参数 > Java 系统属性（-D） > 操作系统环境变量
> application-{profile}.yml（profile 特定配置）
> application.yml（主配置）
> classpath 内默认配置
```

高优先级覆盖低优先级。多 profile 场景：`application-prod.yml` 会覆盖 `application.yml` 中的同名配置项。

### 4.2 @Value 与 @ConfigurationProperties 对比

| 对比维度 | `@Value`                    | `@ConfigurationProperties`   |
| -------- | --------------------------- | ---------------------------- |
| 使用方式 | 单个属性注入                | 绑定到整个配置类             |
| 类型安全 | 弱（字符串/简单类型转换）   | 强（自动完成复杂类型、校验） |
| 复杂结构 | 不支持（List/Map 绑定繁琐） | 支持（嵌套对象、List、Map）  |
| 校验     | 不支持                      | 支持 `@Validated` + JSR-303  |
| 推荐场景 | 单个简单属性                | 一组相关配置项（推荐）       |

```java
// @Value
@Value("${mail.host}")
private String host;

// @ConfigurationProperties（推荐）
@Component
@ConfigurationProperties(prefix = "mail")
public class MailProperties {
    private String host;
    private int port;
    // getter/setter
}
```

## 5. Spring Boot 启动流程（源码层面）

```text
new SpringApplication(主类)
  ├─ 推断 Web 应用类型（Servlet/Reactive/None）
  ├─ 加载 ApplicationContextInitializer / ApplicationListener（spring.factories）
  └─ 推断主启动类
        ↓
run(args)
  ├─ 准备 Environment（配置文件/环境变量/命令行参数，按优先级组装 PropertySource）
  ├─ 创建 ApplicationContext（Servlet → AnnotationConfigServletWebServerApplicationContext）
  ├─ prepareContext（注册主类为配置类）
  ├─ refresh()（12 步容器刷新）
  │     ├─ 组件扫描 + 解析 @Configuration + 处理 @Import（自动装配在此触发）
  │     ├─ onRefresh() → 启动内嵌 Tomcat
  │     └─ 实例化非懒加载单例 Bean（依赖注入完成）
  ├─ 执行 ApplicationRunner / CommandLineRunner
  └─ 发布 ApplicationReadyEvent，应用就绪
```

详细源码逐段解析见 [Spring Boot 核心源码解读](/system-design/framework/spring/springboot-source-code.html)。

## 6. 内嵌 Web 服务器（Tomcat）是如何启动的？

- Spring Boot 通过 `ServletWebServerFactory`（默认 `TomcatServletWebServerFactory`）创建内嵌容器。
- 容器启动发生在 `refresh()` 的 `onRefresh()` 阶段，由 `ServletWebServerApplicationContext` 触发 `createWebServer()`。
- 换容器只需换依赖：`spring-boot-starter-web`（Tomcat）→ `spring-boot-starter-undertow` / `spring-boot-starter-jetty`，业务代码零改动（`WebServerFactory` + `WebServer` 抽象）。

## 7. 常用注解速查

| 类别     | 注解                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 组合注解 | `@SpringBootApplication`                                                                                                      |
| 配置类   | `@Configuration`、`@ConfigurationProperties`、`@EnableConfigurationProperties`                                                |
| 条件装配 | `@ConditionalOnClass`、`@ConditionalOnMissingBean`、`@ConditionalOnProperty`                                                  |
| 启动回调 | `ApplicationRunner`、`CommandLineRunner`（两者的区别：后者接收原始 `String[] args`，前者接收封装后的 `ApplicationArguments`） |
| 异常处理 | `@RestControllerAdvice` + `@ExceptionHandler`（全局统一异常处理）                                                             |
| 定时任务 | `@EnableScheduling` + `@Scheduled`                                                                                            |
| 异步     | `@EnableAsync` + `@Async`                                                                                                     |

## 8. 补充高频题

### 8.1 为什么有时候 @Component 扫描不到？

`@ComponentScan` 默认扫描**启动类所在包及其子包**。组件放在启动类所在包之外就扫不到。解决：

- 把组件移到启动类包内（推荐）；
- 或用 `@ComponentScan(basePackages = "xxx.xxx")` 显式指定扫描范围；
- 或 `@Import` 手动导入。

### 8.2 Spring Boot 如何统一处理异常？

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(BusinessException.class)
    public Result<?> handleBusiness(BusinessException e) {
        return Result.error(e.getCode(), e.getMessage());
    }
}
```

> 分层思想：Controller 层不做 try-catch，抛业务异常，由 `@RestControllerAdvice` 统一转换为友好响应。

### 8.3 Actuator 是什么？

- Spring Boot 的**生产级监控端点**（`spring-boot-starter-actuator`）。
- 常用端点：`/actuator/health`（健康检查，配合注册中心/负载均衡探活）、`/actuator/metrics`（指标）、`/actuator/env`（环境配置）、`/actuator/loggers`（动态调整日志级别）。
- **注意**：生产环境要按需暴露端点并做好鉴权，避免信息泄露。

### 8.4 Spring Boot 与 Spring Cloud 的关系？

- **Spring Boot**：快速构建单个微服务应用的框架。
- **Spring Cloud**：基于 Spring Boot 的**微服务治理全家桶**（注册中心 Eureka/Nacos、网关 Gateway、配置中心 Config/Nacos、熔断 Sentinel 等），解决微服务之间的发现、路由、配置、容错等分布式问题。
- 关系：**Spring Cloud 依赖 Spring Boot**，每个微服务都是一个 Spring Boot 应用。

## 面试高频问题速查

1. Spring Boot 与 Spring 的区别？
2. @SpringBootApplication 由哪几个注解组成？分别做什么？
3. 自动装配的原理？（imports 文件 + 条件注解）
4. 如何自定义 Starter？
5. 配置加载优先级？@Value 与 @ConfigurationProperties 的区别？
6. Spring Boot 启动流程？
7. 内嵌 Tomcat 如何启动？
8. 为什么组件扫描不到？如何解决？
9. Spring Boot 如何统一处理异常？
10. Actuator 有哪些常用端点？
11. Spring Boot 与 Spring Cloud 的关系？
12. Spring Boot 为什么"开箱即用"？（自动装配 + Starter + 内嵌容器）

## 相关文章

- [Spring Boot 自动装配原理详解](/system-design/framework/spring/spring-boot-auto-assembly-principles.html)
- [Spring Boot 核心源码解读](/system-design/framework/spring/springboot-source-code.html)
- [Spring 常见面试题总结](/system-design/framework/spring/spring-knowledge-and-questions-summary.html)
- [Spring 常见注解总结](/system-design/framework/spring/spring-common-annotations.html)
- [Spring Boot 读取配置详解](/system-design/framework/spring/springboot-read-config.html)
