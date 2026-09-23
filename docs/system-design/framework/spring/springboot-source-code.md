---
title: Spring Boot核心源码解读
description: Spring Boot核心源码深度解读，涵盖SpringApplication启动全流程源码分析（环境准备、容器创建、刷新、内嵌Web服务器）、自动配置源码原理（AutoConfigurationImportSelector、条件注解、Starter机制）与自定义Starter实践。
category: 框架
tag:
  - Spring
head:
  - - meta
    - name: keywords
      content: Spring Boot源码,启动流程,自动配置源码,SpringApplication,Bean加载,条件注解,源码解读,AutoConfigurationImportSelector,自定义Starter,内嵌Tomcat
---

Spring Boot 的核心价值在于 **自动装配（Auto-Configuration）** 和 **一键启动**。它让开发者摆脱繁琐的 XML/Java 配置，把"约定优于配置（Convention over Configuration）"落地为工程实践。理解 Spring Boot 源码，重点是两条主线：

1. **启动流程**：`SpringApplication.run()` 内部发生了什么，容器是如何被创建、刷新并对外提供服务的；
2. **自动装配原理**：`@EnableAutoConfiguration` 如何把成百上千的自动配置类"按需"加载成可用的 Bean。

## SpringApplication 启动流程（源码级）

启动入口只有一行代码：

```java
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

`SpringApplication.run(Class, String...)` 是静态方法，内部实际是 `new SpringApplication(primarySources).run(args)`，分为**实例化阶段**和**运行阶段**两大部分。

### 阶段一：创建 SpringApplication 实例

```java
public SpringApplication(ResourceLoader resourceLoader, Class<?>... primarySources) {
    ...
    this.webApplicationType = WebApplicationType.deduceFromClasspath();
    // 1. 从 META-INF/spring.factories 加载 ApplicationContextInitializer 列表
    setInitializers((Collection) getSpringFactoriesInstances(ApplicationContextInitializer.class));
    // 2. 从 META-INF/spring.factories 加载 ApplicationListener 列表
    setListeners((Collection) getSpringFactoriesInstances(ApplicationListener.class));
    // 3. 推断主启动类（main 方法所在类）
    this.mainApplicationClass = deduceMainApplicationClass();
}
```

关键点：

- **推断 Web 应用类型**：根据类路径上是否存在 `jakarta.servlet.Servlet` / `org.springframework.web.reactive.DispatcherHandler`，推断出 SERVLET / REACTIVE / NONE 三种类型之一，决定后续创建哪种容器。
- **加载 ApplicationContextInitializer**：容器刷新前的初始化钩子，如 `ServerPortInfoApplicationContextInitializer`（把端口写入 Environment）。
- **加载 ApplicationListener**：Spring Boot 内置的监听器，监听启动过程中的各类事件（`ApplicationEnvironmentPreparedEvent`、`ApplicationPreparedEvent` 等）。
- **SpringFactories 机制**：Spring Boot 3.0 之前通过 `META-INF/spring.factories`（Properties 格式，`key=逗号分隔的类名列表`）注册扩展点；3.0 之后逐步迁移到 `META-INF/spring/...imports`（每行一个类名）。注意区分：`spring.factories` 目前主要用于 `ApplicationContextInitializer`/`ApplicationListener` 等扩展点，而**自动配置类的注册已迁移到 imports 文件**。

### 阶段二：run() 方法主流程

```java
public ConfigurableApplicationContext run(String... args) {
    // 1. 创建并启动 StopWatch（计时）
    StopWatch stopWatch = new StopWatch();
    stopWatch.start();

    // 2. 启动事件广播器：加载所有 SpringApplicationRunListener
    SpringApplicationRunListeners listeners = getRunListeners(args);
    listeners.starting();   // 发布 ApplicationStartingEvent

    // 3. 准备 Environment
    ConfigurableEnvironment environment = prepareEnvironment(listeners, bootstrapContext, defaultProperties);

    // 4. 创建 ApplicationContext
    context = createApplicationContext();
    context.setApplicationStartup(this.applicationStartup);

    // 5. 容器刷新前准备：注册 BeanNameGenerator、资源加载器、转换服务
    prepareContext(bootstrapContext, context, environment, listeners, applicationArguments, printedBanner);

    // 6. 刷新容器（核心，复用 Spring 的 AbstractApplicationContext#refresh）
    refreshContext(context);

    // 7. 刷新后处理：调用 ApplicationRunner / CommandLineRunner
    afterRefresh(context, applicationArguments);

    listeners.started(context);   // 发布 ApplicationStartedEvent
    // 8. 触发 ApplicationReadyEvent，应用正式就绪
    callRunners(context, applicationArguments);
    listeners.ready(context, applicationArguments);
    return context;
}
```

#### 1. 启动监听与事件

`SpringApplicationRunListener`（实现类 `EventPublishingRunListener`）负责把启动过程中的关键节点包装成 Spring 事件广播出去。整个生命周期会依次触发：`starting → environmentPrepared → contextPrepared → contextLoaded → started → ready → failed`。监听器机制让框架具备极强的可扩展性——你可以在任意启动阶段插入自定义逻辑。

#### 2. 准备 Environment

`prepareEnvironment()` 的核心是 `ConfigurableEnvironment`（实现类通常是 `ApplicationServletEnvironment`/`ApplicationEnvironment`），它管理多个 **PropertySource**，按优先级排列：

```
命令行参数 > ServletConfig 初始化参数 > JNDI > Java 系统属性(System.getProperties)
> 操作系统环境变量 > application-{profile}.yml > application.yml > @PropertySource
> 默认属性
```

高优先级的配置会覆盖低优先级。Spring Boot 的配置来源（配置文件、环境变量、命令行）统一抽象为 `PropertySource`，通过 `MutablePropertySources` 维护顺序，这是"配置优先级"实现的基础。

#### 3. 创建 ApplicationContext

`createApplicationContext()` 根据之前推断的 `webApplicationType` 创建对应的容器：

- SERVLET：`AnnotationConfigServletWebServerApplicationContext`
- REACTIVE：`AnnotationConfigReactiveWebServerApplicationContext`
- NONE：`AnnotationConfigApplicationContext`

三者都继承自 Spring 的 `AnnotationConfigRegistry`，意味着都支持**基于注解的配置类注册**。**主启动类（带 `@SpringBootApplication` 的类）会被注册为一个配置类**，并作为后续组件扫描的起点。

#### 4. 刷新容器 refresh()（最核心的一步）

`refreshContext()` 最终调用的是 Spring 容器 `AbstractApplicationContext#refresh()`，这也是 Spring 框架本身最核心的方法，12 个步骤：

```java
public void refresh() throws BeansException, IllegalStateException {
    // 1. 准备刷新：设置启动时间、开启活动标志、初始化占位符属性源
    prepareRefresh();

    // 2. 获取并准备 BeanFactory（解析 XML/注解，注册默认环境 Bean）
    ConfigurableListableBeanFactory beanFactory = obtainFreshBeanFactory();

    // 3. 准备 BeanFactory：设置类加载器、SpEL 解析器、注册默认的 ApplicationContextAwareProcessor 等
    prepareBeanFactory(beanFactory);

    // 4. 子类扩展：BeanFactory 后置处理（Web 场景注册 ServletContext 相关 Bean）
    postProcessBeanFactory(beanFactory);

    // 5. 调用 BeanFactoryPostProcessor（@ComponentScan 扫描、@Configuration 类解析都在这里）
    invokeBeanFactoryPostProcessors(beanFactory);

    // 6. 注册 BeanPostProcessor（Bean 实例化前后的拦截器）
    registerBeanPostProcessors(beanFactory);

    // 7. 初始化消息源（国际化）
    initMessageSource();

    // 8. 初始化事件广播器
    initApplicationEventMulticaster();

    // 9. 模板方法：子类刷新（Spring Boot 在这里启动内嵌 Web 服务器）
    onRefresh();

    // 10. 注册 ApplicationListener
    registerListeners();

    // 11. 实例化所有非懒加载的单例 Bean（依赖注入主要发生在这里）
    finishBeanFactoryInitialization(beanFactory);

    // 12. 完成刷新：发布 ContextRefreshedEvent、初始化生命周期处理器
    finishRefresh();
}
```

其中与 Spring Boot 关系最密切的：

- **第 5 步**：`ConfigurationClassPostProcessor`（一个 `BeanDefinitionRegistryPostProcessor`）在此执行，完成 **`@ComponentScan` 扫描**、**解析 `@Configuration` 类**、**处理 `@Import`**（自动装配的 `AutoConfigurationImportSelector` 就是通过 `@Import` 引入的）。**自动装配在这一步已经被触发**。
- **第 9 步**：`ServletWebServerApplicationContext` 重写了 `onRefresh()`，在此创建并启动**内嵌 Tomcat/Jetty/Undertow**。
- **第 11 步**：非懒加载单例 Bean 在此创建，依赖注入完成（`@Autowired`、构造器注入等）。
- **第 12 步**：发布 `ContextRefreshedEvent`，`SmartLifecycle` 生命周期回调启动。

#### 5. 刷新后处理：Runners

`afterRefresh()` 依次调用所有 `ApplicationRunner` 和 `CommandLineRunner` 实现类，这是应用"启动后执行初始化逻辑"的标准方式（两者区别：`ApplicationRunner` 接收封装后的 `ApplicationArguments`，`CommandLineRunner` 接收原始 `String[] args`）。

### 内嵌 Web 服务器是如何启动的？

关键在 `refresh()` 的第 9 步 `onRefresh()`。以 Tomcat 为例，链路大致是：

1. `ServletWebServerApplicationContext.onRefresh()` 调用 `createWebServer()`。
2. `createWebServer()` 从 `ServletWebServerFactory` 工厂创建 `WebServer`（默认 `TomcatServletWebServerFactory`）。
3. `Tomcat` 实例化、连接器配置（端口来自 `server.port`，默认 8080）、初始化 Servlet 容器。
4. Tomcat 启动后，Spring 的 `DispatcherServlet` 被注册并映射到 `/`。
5. 这样，外部请求才能进入 Spring MVC 的处理链路。

> 如果你换成 Undertow/Jetty，只需改 `spring-boot-starter-web` 为对应 starter，其余逻辑完全一致——这就是**可替换的内嵌容器抽象**（`WebServerFactory` + `WebServer`）的威力。

## 自动装配原理（源码级）

### @SpringBootApplication 的三重身份

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
@SpringBootConfiguration      // 本质 = @Configuration，标记为配置类
@EnableAutoConfiguration      // 自动装配入口
@ComponentScan(...)           // 组件扫描：默认扫描启动类所在包及其子包
public @interface SpringBootApplication {}
```

- `@SpringBootConfiguration`：`@Configuration` 的"派生注解"，语义上强调这是 Boot 的主配置类。
- `@ComponentScan`：扫描范围是**启动类所在包及其子包**，因此约定启动类必须放在包的最外层。
- `@EnableAutoConfiguration`：自动装配的真正入口。

### @EnableAutoConfiguration 如何生效？

```java
@AutoConfigurationPackage
@Import(AutoConfigurationImportSelector.class)
public @interface EnableAutoConfiguration {}
```

`@Import(AutoConfigurationImportSelector.class)` 是关键：**`AutoConfigurationImportSelector` 是一个 `ImportSelector`**，Spring 容器在处理 `@Configuration` 类时，会调用它的 `selectImports()` 方法动态注册一批额外的配置类。`AutoConfigurationImportSelector` 的核心方法是 `getAutoConfigurationEntry()`：

```java
protected AutoConfigurationEntry getAutoConfigurationEntry(AnnotationMetadata annotationMetadata) {
    // 1. 检查 @EnableAutoConfiguration 的 exclude/excludeName 属性
    AnnotationAttributes attributes = getAttributes(annotationMetadata);

    // 2. 读取所有候选自动配置类
    //    - Spring Boot 2.7+ / 3.x：META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
    //    - 旧版：META-INF/spring.factories 中 EnableAutoConfiguration 键
    List<String> configurations = getCandidateConfigurations(annotationMetadata, attributes);

    // 3. 去掉重复项
    configurations = removeDuplicates(configurations);

    // 4. 处理 @AutoConfigurationImportFilter（如 OnClassCondition 过滤）
    Set<String> exclusions = getExclusions(annotationMetadata, attributes);
    checkExcludedClasses(configurations, exclusions);
    configurations.removeAll(exclusions);

    // 5. 应用过滤条件，返回最终生效的自动配置类
    configurations = getConfigurationClassFilter().filter(configurations);
    ...
}
```

#### 1. 候选自动配置类从哪来？

Spring Boot 2.7 起，自动配置类的注册从 `spring.factories` 迁移到专门的 imports 文件：

```
META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
```

文件每行一个自动配置类全限定名。以 `spring-boot-autoconfigure` 包为例，其中包含 `RedisAutoConfiguration`、`DataSourceAutoConfiguration`、`MybatisAutoConfiguration`（在 mybatis starter 中）等几百个候选类。**它们只是"候选"，真正生效需要经过条件注解过滤**。

#### 2. 条件注解如何做到"按需装配"？

每个自动配置类上都标注了条件注解，只有满足条件才会被真正解析。常用条件注解：

| 条件注解                                             | 判定逻辑                | 示例                                                                                      |
| ---------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `@ConditionalOnClass` / `@ConditionalOnMissingClass` | 类路径上是否存在某个类  | `@ConditionalOnClass(RedisOperations.class)`：有 Jedis/Lettuce 依赖才装配 Redis 自动配置  |
| `@ConditionalOnBean` / `@ConditionalOnMissingBean`   | 容器中是否已存在某 Bean | `@ConditionalOnMissingBean`：用户自定义了 `RedisTemplate` 就不再装配默认的                |
| `@ConditionalOnProperty`                             | 配置项是否存在/取值     | `@ConditionalOnProperty(prefix = "spring.redis", name = "enabled", havingValue = "true")` |
| `@ConditionalOnWebApplication`                       | 是否为 Web 应用         |                                                                                           |
| `@ConditionalOnExpression`                           | SpEL 表达式             |                                                                                           |

以 `RedisAutoConfiguration` 为例（简化）：

```java
@AutoConfiguration
@ConditionalOnClass(RedisOperations.class)          // 类路径有 Redis 依赖才装配
@EnableConfigurationProperties(RedisProperties.class) // 绑定 spring.data.redis.* 配置
public class RedisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(name = "redisTemplate")  // 用户没自定义才创建
    @ConditionalOnSingleCandidate(RedisConnectionFactory.class)
    public RedisTemplate<Object, Object> redisTemplate(RedisConnectionFactory connectionFactory) { ... }
}
```

这种"**类路径判断 + Bean 缺失判断 + 配置判断**"的组合，实现了：**引入依赖 → 自动获得默认 Bean；用户自定义 → 覆盖默认配置**。这就是"约定优于配置"的落地机制。

#### 3. 自动配置类的加载顺序

多个自动配置类之间存在依赖关系，通过以下注解控制顺序：

- `@AutoConfigureAfter(A.class)`：在 A 之后加载（如 `RedisAutoConfiguration` 要等 `DataSourceAutoConfiguration`？不，是等连接池相关配置之后）。
- `@AutoConfigureBefore(A.class)`：在 A 之前加载。
- `@AutoConfigureOrder(n)`：数字越小越先加载。

典型例子：`MybatisAutoConfiguration` 标注 `@AutoConfigureAfter(DataSourceAutoConfiguration.class)`，确保数据源先配置好，MyBatis 才能用。

#### 4. 为什么自动装配不会与用户配置冲突？

两条核心机制：

1. **`@ConditionalOnMissingBean`**：用户自定义了同名 Bean，自动配置的默认 Bean 就不生效；
2. **Bean 覆盖策略**：默认情况下容器不允许 Bean 名重复注册（`allowBeanDefinitionOverriding` 默认 false），自动配置类用 `@ConditionalOnMissingBean` 主动让位，从源头避免冲突。

## 自定义 Starter（实战）

自定义 Starter 的本质：**把"自动配置类 + 依赖"打包成可复用组件，别人引入依赖即可用**。步骤：

### 1. 编写自动配置类

```java
@AutoConfiguration
@EnableConfigurationProperties(MailProperties.class)   // 绑定 mail.* 配置
@ConditionalOnClass(MailSender.class)
public class MailAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public MailSender mailSender(MailProperties properties) {
        return new MailSender(properties.getHost(), properties.getPort());
    }
}
```

### 2. 编写配置属性类

```java
@ConfigurationProperties(prefix = "mail")
public class MailProperties {
    private String host;
    private int port;
    // getter / setter 省略
}
```

### 3. 注册自动配置类

在 `src/main/resources/META-INF/spring/` 下创建 `org.springframework.boot.autoconfigure.AutoConfiguration.imports`：

```
com.example.mail.MailAutoConfiguration
```

### 4. 引入方使用

```yaml
mail:
  host: smtp.example.com
  port: 465
```

```java
@Autowired
private MailSender mailSender;   // 直接注入即可使用
```

**关键点**：

- 自动配置类与业务代码**分包**放置（约定包名如 `xxx.autoconfigure`），避免被使用方的 `@ComponentScan` 意外扫描到；
- 一定要用条件注解控制生效时机（`@ConditionalOnClass`/`@ConditionalOnMissingBean`），保证用户可覆盖、无依赖时不加载；
- `@EnableConfigurationProperties` + `@ConfigurationProperties` 实现配置的自动绑定与提示。

## 常见面试问题

1. **Spring Boot 和 Spring 的区别？**——Spring Boot 基于 Spring，通过自动装配、内嵌容器、起步依赖实现"约定优于配置、开箱即用"。详见 [Spring Boot 常见面试题总结](/system-design/framework/spring/springboot-knowledge-and-questions-summary.html)。
2. **`@SpringBootApplication` 为什么能自动扫描？**——它是 `@ComponentScan` + `@EnableAutoConfiguration` + `@SpringBootConfiguration` 的组合注解。
3. **`SpringApplication.run()` 的执行流程？**——按"实例化（推断 Web 类型/加载 initializers/listeners）→ 准备 Environment → 创建容器 → prepareContext → refresh（12 步）→ 执行 Runners"展开回答。
4. **自动装配为什么按需加载？**——`AutoConfigurationImportSelector` 读取 imports 文件得到候选类，再通过 `@ConditionalOnXxx` 过滤。
5. **`@EnableAutoConfiguration` 的原理？**——`@Import(AutoConfigurationImportSelector.class)` → `selectImports` → `getAutoConfigurationEntry` → 读 imports → 排除/过滤 → 注册。
6. **为什么引入一个 starter 就能自动获得 Bean？**——Starter 内自带自动配置类 + imports 注册 + 条件注解控制，引入依赖即触发装配。
7. **如何自定义 Starter？**——按上文四步回答。
8. **内嵌 Tomcat 是如何启动的？**——`refresh()` 第 9 步 `onRefresh()` → `createWebServer()` → `WebServerFactory` 创建并启动 `WebServer`。

## 相关文章

- [Spring Boot 自动装配原理详解](/system-design/framework/spring/spring-boot-auto-assembly-principles.html)：更专注自动装配机制的图文详解
- [Spring Boot 常见面试题总结](/system-design/framework/spring/springboot-knowledge-and-questions-summary.html)
- [Spring 常见面试题总结](/system-design/framework/spring/spring-knowledge-and-questions-summary.html)
- [Spring 设计模式总结](/system-design/framework/spring/spring-design-patterns-summary.html)

## 参考

- Spring Boot 官方文档：<https://docs.spring.io/spring-boot/docs/current/reference/html/>
- Spring Boot 源码（GitHub）：<https://github.com/spring-projects/spring-boot>
- 《Spring Boot 编程思想》（小马哥）
