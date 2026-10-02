---
title: 算法题常用集合操作总结：Java 集合 API 速查与避坑
description: 算法面试常用集合操作总结，系统整理数组与 Arrays、String/StringBuilder、List、Set、Map、ArrayDeque 栈队列、PriorityQueue 堆、排序比较器、BitSet 的常用方法与复杂度，并总结 Arrays.asList、remove 重载、int[] 排序、Integer 缓存等高频坑。
category: 计算机基础
tag:
  - 算法
  - Java集合
head:
  - - meta
    - name: keywords
      content: 算法常用集合,Java集合API,集合操作速查,Arrays.asList,PriorityQueue,ArrayDeque,HashMap,computeIfAbsent,TreeMap,TreeSet,比较器,算法面试,集合避坑
---

算法面试里真正拖后腿的往往不是思路，而是**集合 API 用得不熟**：知道该用哈希计数，却想不起来 `computeIfAbsent` 怎么写；知道要用小顶堆，却写不对比较器；明明思路正确，最后挂在 `Arrays.asList` 不能 `add`、`remove(int)` 删错元素、`int[]` 不能直接传比较器这些细节上。

这篇文档不谈算法思想（二分、DP、回溯等请见算法专题其他文章），只解决一件事：**把算法题里高频出现的集合与 API 整理成一份可查、可背、可避坑的速查手册。**

## 面试考察重点

- 能根据需求（去重、计数、映射、有序、优先级、两端操作）快速选出合适的容器。
- 能熟练写 `Map` 的计数、分组、合并等高频写法。
- 能用 `ArrayDeque` 实现栈/队列/单调栈/单调队列。
- 能用 `PriorityQueue` 写对比较器，解决 Top K、合并 K 个有序链表、Dijkstra 等。
- 能写对排序比较器，避免 `int[]` 排序、减法溢出、`remove` 重载等经典坑。
- 能说清各容器的增删查复杂度。

## 按需求选容器（速查表）

做题时先问自己"我需要什么能力"，再选容器：

| 需求                   | 首选                              | 备选 / 说明                           |
| ---------------------- | --------------------------------- | ------------------------------------- |
| 按下标随机访问、遍历   | `int[]` / `ArrayList`             | 数组更快、无装箱；`ArrayList` 更灵活  |
| 动态增删（主要在尾部） | `ArrayList`                       | 中间插入/删除是 `O(n)`                |
| 频繁在头部插入/删除    | `ArrayDeque`                      | 不要用 `ArrayList`（头部操作 `O(n)`） |
| 去重、判断是否存在     | `HashSet`                         | 元素少且范围小 → 布尔数组             |
| 统计出现次数           | `HashMap` / `int[]` 计数数组      | 下标是 0~25 的字母 → `int[26]`        |
| 键值映射               | `HashMap`                         | 需要按 key 有序 → `TreeMap`           |
| 保持插入顺序           | `LinkedHashMap` / `LinkedHashSet` | LRU 常用 `LinkedHashMap`              |
| 需要有序 + 区间查询    | `TreeMap` / `TreeSet`             | `floorKey`/`ceilingKey`/`headMap`     |
| 每次取最小/最大        | `PriorityQueue`                   | 大顶堆传 `Comparator.reverseOrder()`  |
| 栈（后进先出）         | `ArrayDeque`（`push`/`pop`）      | 不用 `Stack`                          |
| 队列（先进先出）       | `ArrayDeque`（`offer`/`poll`）    | 不用 `LinkedList`（除非要存 null）    |
| 双端队列               | `ArrayDeque`                      | `offerFirst`/`pollLast` 等            |
| 位标记、状态压缩       | `int` 位运算 / `BitSet`           | 布尔数组的省内存替代                  |

对应的复杂度速查：

| 容器                              | 随机访问      | 查找        | 插入                         | 删除            | 备注                                   |
| --------------------------------- | ------------- | ----------- | ---------------------------- | --------------- | -------------------------------------- |
| `int[]`                           | `O(1)`        | `O(n)`      | —                            | —               | 定长，最快，无装箱                     |
| `ArrayList`                       | `O(1)`        | `O(n)`      | 尾部均摊 `O(1)`，中间 `O(n)` | 中间 `O(n)`     | 扩容 1.5 倍                            |
| `LinkedList`                      | `O(n)`        | `O(n)`      | 已知节点 `O(1)`              | 已知节点 `O(1)` | 实际很少用                             |
| `HashSet` / `HashMap`             | —             | 平均 `O(1)` | 平均 `O(1)`                  | 平均 `O(1)`     | 最坏 `O(n)`                            |
| `LinkedHashSet` / `LinkedHashMap` | —             | 平均 `O(1)` | 平均 `O(1)`                  | 平均 `O(1)`     | 额外维护链表                           |
| `TreeSet` / `TreeMap`             | —             | `O(log n)`  | `O(log n)`                   | `O(log n)`      | 红黑树，有序                           |
| `PriorityQueue`                   | 仅堆顶 `O(1)` | `O(n)`      | `O(log n)`                   | 堆顶 `O(log n)` | 无按序删除，`remove(Object)` 为 `O(n)` |
| `ArrayDeque`                      | —             | `O(n)`      | 两端 `O(1)`                  | 两端 `O(1)`     | 不可存 null                            |

## 数组与 Arrays 工具类

### 高频操作

```java
int[] a = {3, 1, 2};

Arrays.sort(a);                       // 升序排序，原地修改
Arrays.sort(a, 1, 3);                 // 只对 [1, 3) 区间排序
Arrays.fill(a, 0);                    // 全部填 0
Arrays.fill(a, 1, 3, -1);             // 区间填充
int[] b = Arrays.copyOf(a, 5);        // 复制并指定新长度（不足补 0）
int[] c = Arrays.copyOfRange(a, 1, 3);// 复制区间 [1, 3)
int idx = Arrays.binarySearch(a, 2);  // 二分查找，要求数组已升序
boolean eq = Arrays.equals(a, b);     // 逐元素比较
String s = Arrays.toString(a);        // 输出 [1, 2, 3]
String m = Arrays.deepToString(new int[][]{{1, 2}}); // 二维数组输出
```

> **`Arrays.sort` 会原地修改数组**，如果需要保留原数组，先 `Arrays.copyOf` 再排序。

> `Arrays.binarySearch` 返回的是下标；**没找到时返回 `-(插入点) - 1`**（必为负数），不是简单的 `-1`。想拿到"该插在哪"要算 `-ret - 1`。前提是数组**已经升序排好**，否则结果是未定义的。

### 原始类型数组不能直接传比较器（高频坑）

`Arrays.sort(int[], Comparator)` **不存在**——只有对象数组才支持自定义比较器：

```java
int[] nums = {1, 3, 2};

// 错误：编译不通过，int[] 没有 Comparator 版本
// Arrays.sort(nums, Comparator.reverseOrder());

// 方式一：升序后反转（原地反转需自己写，Collections.reverse 只支持 List）
Arrays.sort(nums);

// 方式二：转为 Integer[] 再用比较器（会装箱，性能略差）
Integer[] boxed = Arrays.stream(nums).boxed().toArray(Integer[]::new);
Arrays.sort(boxed, Comparator.reverseOrder());

// 方式三：只求最值/相对顺序时，排序后倒序取即可，不必真的降序
```

如果题目只是"取最大的 K 个"或"从大到小遍历"，**升序排序后倒序遍历**通常比转 `Integer[]` 更省事。

### 数组与 List 互转

```java
// 数组 → List（注意：返回的是固定大小的视图，不能 add/remove）
List<Integer> fixed = Arrays.asList(1, 2, 3);

// 需要可变的 List：外面再包一层
List<Integer> mutable = new ArrayList<>(Arrays.asList(1, 2, 3));
List<Integer> mutable2 = new ArrayList<>(List.of(1, 2, 3));

// List → 数组
Integer[] arr = mutable.toArray(new Integer[0]);
```

> **`Arrays.asList` 传原始类型数组是个隐蔽的坑**：`Arrays.asList(new int[]{1, 2, 3})` 得到的不是 `List<Integer>`，而是长度为 1 的 `List<int[]>`——因为泛型不支持基本类型，整个 `int[]` 被当成**一个**元素。原始类型转 `List` 必须先装箱：`Arrays.stream(nums).boxed().collect(Collectors.toList())`。

`int[]` 与 `Integer[]` 的互转（装箱 / 拆箱）：

```java
int[] nums = {1, 2, 3};

Integer[] boxed = Arrays.stream(nums).boxed().toArray(Integer[]::new);       // int[] → Integer[]
int[] unboxed = Arrays.stream(boxed).mapToInt(Integer::intValue).toArray();  // Integer[] → int[]
```

多维数组与 `List` 的转换：

```java
// List<List<Integer>> → int[][]
List<List<Integer>> res = new ArrayList<>();
int[][] ans = new int[res.size()][];
for (int i = 0; i < res.size(); i++) {
    ans[i] = res.get(i).stream().mapToInt(Integer::intValue).toArray();
}

// List<int[]> → int[][]（区间、图论题常用；注意是 new int[0][]，不是 new int[0]）
List<int[]> list = new ArrayList<>();
int[][] arr2d = list.toArray(new int[0][]);
```

### 二维数组排序

```java
int[][] intervals = {{3, 5}, {1, 2}, {2, 6}};

// 按第一列升序；第一列相同时按第二列升序
Arrays.sort(intervals, (x, y) -> x[0] != y[0]
        ? Integer.compare(x[0], y[0])
        : Integer.compare(x[1], y[1]));

// 更推荐的写法：Comparator 链式调用，可读性更好
Arrays.sort(intervals, Comparator.comparingInt((int[] x) -> x[0])
        .thenComparingInt(x -> x[1]));
```

> **必须用 `Integer.compare` 而不是 `x[0] - y[0]`**：减法在接近 `int` 边界时会溢出，导致排序结果错乱（这是一个非常经典的线上事故来源）。

## String 与 StringBuilder

### 高频操作

```java
String s = "Hello World";

char ch = s.charAt(0);                       // 取字符
int len = s.length();                        // 长度
char[] cs = s.toCharArray();                 // 转字符数组（原地修改常用）
String sub = s.substring(0, 5);              // 左闭右开 [0, 5)
int i = s.indexOf("World");                  // 首次出现位置，没有返回 -1
int li = s.lastIndexOf('l');                 // 最后一次出现位置
boolean has = s.contains("Hello");
String[] parts = s.split(" ");               // 按分隔符切分
String[] parts2 = s.split(",", 2);           // 限制切分为 2 段
String rep = s.replace("l", "L");            // 字面量替换（全部替换）
String clean = s.replaceAll("\\s+", "");     // 正则替换
String j = String.join("-", "a", "b", "c");  // "a-b-c"
boolean eq = s.equals("Hello World");        // 内容比较，不要用 ==
int cmp = s.compareTo("Hello");              // 字典序比较

boolean pre = s.startsWith("He");            // 前缀判断，另有 endsWith
int i2 = s.indexOf('l', 4);                  // 从下标 4 起找（也有 indexOf(String, fromIndex)）
String up = s.toUpperCase();                 // 转大写（toLowerCase 转小写）
String trim = "  a  ".trim();                // 去首尾空白（strip 支持 Unicode 空白，JDK 11+）
boolean empty = s.isEmpty();                 // 是否为空串
```

### 字符与数字互转

```java
char c = '7';
int digit = c - '0';                 // 最快，推荐
int digit2 = Character.getNumericValue(c);
char back = (char) ('0' + digit);    // 数字转字符

boolean isDigit = Character.isDigit(c);
boolean isLetter = Character.isLetter(c);
boolean isAlnum = Character.isLetterOrDigit(c);
boolean isUpper = Character.isUpperCase('A');
boolean isSpace = Character.isWhitespace(' ');
char lower = Character.toLowerCase('A');
char upper = Character.toUpperCase('a');
```

> `Character.getNumericValue` 对 `'0'~'9'` 返回 0~9，但对 `'a'~'z'` 返回 **10~35**（十六进制语义），日常判数字请优先用 `c - '0'`。

字符串与整数之间的整体转换：

```java
int num = Integer.parseInt("123");     // 字符串 → int，非法输入抛 NumberFormatException
long big = Long.parseLong("123456789012");
String str = String.valueOf(123);      // int → 字符串（推荐，能处理 null）
String str2 = Integer.toString(123);   // 等价写法

// char[] → String：切忌用 arr.toString() 或 Arrays.toString()（得到地址或 "[a, b, c]"）
char[] arrCh = {'a', 'b', 'c'};
String fromChars = new String(arrCh);  // "abc"
```

### 大小写字母计数（`int[26]` 套路）

题目里出现"只包含小写英文字母"时，用长度 26 的计数数组代替 `HashMap`，又快又省：

```java
int[] count = new int[26];
for (char c : s.toCharArray()) {
    count[c - 'a']++;
}
// 判断两个字符串是否为字母异位词：比较两个计数数组是否相等
Arrays.equals(countA, countB);
```

> 如果字符集包含大写字母、数字或 ASCII 全范围，把数组扩到 `int[128]` 或用 `HashMap<Character, Integer>`。

### StringBuilder

字符串在循环里拼接会创建大量临时对象，必须用 `StringBuilder`：

```java
StringBuilder sb = new StringBuilder(64); // 预设容量可减少扩容（默认容量 16）
sb.append("a").append(1).append(true);   // 链式追加，返回 this
sb.insert(0, "head");                    // 指定位置插入
sb.deleteCharAt(0);                      // 删除某个字符（O(n)）
sb.delete(0, 2);                         // 删除区间 [0, 2)，左闭右开
sb.setCharAt(0, 'H');                    // 修改某个字符
sb.charAt(0);                            // 读取某个字符
sb.indexOf("a");                         // 查找子串首次出现位置，没有返回 -1
sb.reverse();                            // 反转
int n = sb.length();
String result = sb.toString();
```

**数组转字符串的快写**：

```java
int[] nums = {1, 2, 3};
StringBuilder sb = new StringBuilder();
for (int num : nums) {
    sb.append(num).append(',');
}
if (sb.length() > 0) {
    sb.setLength(sb.length() - 1);   // 去掉末尾多余分隔符
}
```

> `StringBuilder` 非线程安全但更快；`StringBuffer` 线程安全但每个方法都加锁，算法题一律用 `StringBuilder`。

## List 常用操作

### 初始化方式对比（重要）

| 写法                             | 可变性     | 能否 `add`/`remove`                              | 能否存 `null` | 说明                             |
| -------------------------------- | ---------- | ------------------------------------------------ | ------------- | -------------------------------- |
| `new ArrayList<>()`              | 可变       | 可以                                             | 可以          | 最常用                           |
| `Arrays.asList(a, b)`            | 长度固定   | **不可以**（抛 `UnsupportedOperationException`） | 可以          | 支持 `set`                       |
| `List.of(a, b)`                  | 完全不可变 | 不可以                                           | **不可以**    | JDK 9+，只读                     |
| `new ArrayList<>(List.of(a, b))` | 可变       | 可以                                             | 可以          | 需要可变时的标准写法             |
| `new ArrayList<>(n)`             | 可变       | 可以                                             | 可以          | 预设容量，已知规模时避免反复扩容 |
| `Collections.emptyList()`        | 完全不可变 | 不可以                                           | —             | 返回空列表，避免返回 null        |

### 常用方法与坑

```java
List<Integer> list = new ArrayList<>(List.of(1, 2, 3));

list.get(0);                 // O(1) 随机访问
list.set(0, 9);              // 修改
list.add(4);                 // 尾部追加，均摊 O(1)
list.add(1, 8);              // 指定位置插入，O(n)
list.size();
list.contains(3);            // O(n)
list.indexOf(3);             // O(n)，没有返回 -1
list.isEmpty();

list.remove(0);              // 删除下标 0 的元素（调用 remove(int)）
list.remove(Integer.valueOf(1)); // 删除值为 1 的元素（调用 remove(Object)）

list.addAll(other);          // 批量追加到尾部
list.clear();                // 清空
list.equals(other);          // 按内容逐个比较，顺序也要一致
list.retainAll(other);       // 原地保留交集
list.removeAll(other);       // 原地删除所有出现在 other 中的元素
list.subList(1, 3);          // 返回 [1, 3) 的视图（不是拷贝，改它会改原 list）
```

> **`remove` 重载是最高频的坑**：`list.remove(1)` 删除的是**下标 1**，不是值为 1 的元素。想按值删除必须显式装箱：`list.remove(Integer.valueOf(1))`。

**遍历中删除元素**：不要在 `for-each` 里直接 `remove`（抛 `ConcurrentModificationException`），要用迭代器或倒序遍历：

```java
// 方式一：Iterator
Iterator<Integer> it = list.iterator();
while (it.hasNext()) {
    if (it.next() % 2 == 0) {
        it.remove();          // 唯一安全的边遍历边删方式
    }
}

// 方式二：倒序遍历（按下标删除）
for (int i = list.size() - 1; i >= 0; i--) {
    if (list.get(i) % 2 == 0) {
        list.remove(i);
    }
}

// 方式三：removeIf（JDK 8+，最简洁）
list.removeIf(x -> x % 2 == 0);
```

### Collections 工具类

```java
List<Integer> list = new ArrayList<>(List.of(3, 1, 2));

Collections.sort(list);                       // 升序（底层 TimSort，稳定）；等价 list.sort(null)
Collections.sort(list, Comparator.reverseOrder()); // 降序
Collections.reverse(list);                    // 反转
Collections.swap(list, 0, 2);                 // 交换两个位置
Collections.max(list);                        // 最大值（可传 Comparator）
Collections.min(list);                        // 最小值
Collections.frequency(list, 2);               // 出现次数，O(n)
Collections.fill(list, 0);                    // 全部填充
Collections.nCopies(5, 0);                    // 生成 5 个 0 的列表（不可变）
Collections.addAll(list, 4, 5, 6);            // 批量追加变长参数
Collections.binarySearch(list, 2);            // 二分查找，要求 list 已升序；未命中返回 -(插入点)-1
Collections.unmodifiableList(list);           // 只读包装
```

> `subList(from, to)` 返回的是**原列表的视图**，修改视图会影响原列表；它不是拷贝。

## Set 常用操作

### 三种 Set 怎么选

| 实现            | 顺序     | 复杂度      | 适用场景                                   |
| --------------- | -------- | ----------- | ------------------------------------------ |
| `HashSet`       | 无序     | 平均 `O(1)` | 去重、存在性判断（最常用）                 |
| `LinkedHashSet` | 插入顺序 | 平均 `O(1)` | 去重且要保持顺序（如返回第一个不重复字符） |
| `TreeSet`       | 升序有序 | `O(log n)`  | 需要有序遍历或区间查询                     |

```java
Set<Integer> visited = new HashSet<>();
visited.add(1);                 // 返回 boolean，false 表示已存在（可用于判重）
visited.contains(1);            // 平均 O(1)
visited.remove(1);
visited.size();
visited.isEmpty();
visited.clear();                // 清空

// 遍历（HashSet 的迭代顺序不确定，别依赖它）
for (int x : visited) { }

// Set.of(...) 是不可变集合，不能 add/remove，也不能存 null（JDK 9+）
Set<Integer> fixed = Set.of(1, 2, 3);

// 集合运算
Set<Integer> a = new HashSet<>(Set.of(1, 2, 3));
Set<Integer> b = new HashSet<>(Set.of(2, 3, 4));
Set<Integer> union = new HashSet<>(a); union.addAll(b);        // 并集
Set<Integer> inter = new HashSet<>(a); inter.retainAll(b);     // 交集
Set<Integer> diff = new HashSet<>(a);  diff.removeAll(b);      // 差集
```

### TreeSet 的区间能力（容易被忽略）

`TreeSet` / `TreeMap` 的价值不在"有序遍历"，而在**按值定位邻居和区间**：

```java
TreeSet<Integer> set = new TreeSet<>(Set.of(1, 3, 5, 7));

set.first();        // 1，最小
set.last();         // 7，最大
set.floor(4);       // 3，小于等于 4 的最大值
set.ceiling(4);     // 5，大于等于 4 的最小值
set.lower(3);       // 1，严格小于 3 的最大值
set.higher(3);      // 5，严格大于 3 的最小值
set.headSet(5);     // [1, 3)，小于 5 的部分
set.tailSet(5);     // [5, 7]，大于等于 5 的部分
```

典型题：区间插入/覆盖、找最近的时间点、日程安排冲突。

> 注意 `first()`/`last()` 在**空集合**上抛 `NoSuchElementException`，而 `floor`/`ceiling`/`lower`/`higher` 找不到时返回 `null`——又是一组"抛异常 vs 返回特殊值"。另外 `HashSet` 允许存一个 `null`，但 `TreeSet` 存 `null` 会抛 `NullPointerException`（要对元素排序）。

### 自定义对象放进 Set/Map 的前提

如果 `TreeSet` 里存自定义对象，必须实现 `Comparable` 或在构造时传入 `Comparator`；如果放进 `HashSet`/`HashMap` 作为 **key**，必须正确重写 `equals` 和 `hashCode`。算法题里更省事的做法是**把对象转成可比较的表示**（如 `String`、`List<Integer>`、编码后的 `long`）。

## Map 常用操作

### 三种 Map 怎么选

| 实现            | 顺序          | 复杂度      | 适用场景                       |
| --------------- | ------------- | ----------- | ------------------------------ |
| `HashMap`       | 无序          | 平均 `O(1)` | 计数、分组、映射（最常用）     |
| `LinkedHashMap` | 插入/访问顺序 | 平均 `O(1)` | 需要顺序（LRU 缓存、按序输出） |
| `TreeMap`       | key 升序      | `O(log n)`  | key 需要有序或区间查询         |

### 基础方法

```java
Map<String, Integer> map = new HashMap<>();

map.put("a", 1);                 // 放入/覆盖，返回被覆盖的旧值（原本没有则返回 null）
map.get("a");                    // 取 value，key 不存在返回 null
map.getOrDefault("b", 0);        // key 不存在时返回默认值，省去自己判空
map.remove("a");                 // 按键删除，返回被删的 value（不存在返回 null）
map.remove("a", 1);              // 仅当 key 映射到 1 时才删除（JDK 8+）
map.containsKey("a");            // 判断 key 是否存在，平均 O(1)
map.containsValue(1);            // 判断 value 是否存在，O(n)
map.size();
map.isEmpty();
map.clear();
map.putAll(other);               // 批量合并，同名 key 由 other 覆盖
```

> 用 `get` 判断"有没有"是不对的：`get` 返回 `null` 既可能是 key 不存在，也可能是 value 本身是 `null`。判断存在性一律用 `containsKey`。

### 高频方法（计数、分组、合并）

这一组 API 是算法题里出现频率最高的，建议直接背下来：

```java
Map<String, Integer> count = new HashMap<>();

// 1. 计数（最推荐）
count.merge(word, 1, Integer::sum);

// 2. 计数（等价写法，可读性也很好）
count.put(word, count.getOrDefault(word, 0) + 1);

// 3. 不存在才放入
count.putIfAbsent(word, 0);

// 4. 不存在则计算并放入（分组、构建邻接表、记忆化）
Map<String, List<Integer>> group = new HashMap<>();
group.computeIfAbsent(key, k -> new ArrayList<>()).add(value);

// 5. 存在才更新
count.computeIfPresent(word, (k, v) -> v + 1);

// 6. 存在则计算，结果为 null 时删除该 key
count.compute(word, (k, v) -> v == null ? 1 : v + 1);
```

> **`computeIfAbsent` 是"分组"场景的最优写法**：一行代码完成"没有就建桶、有就往里加"，避免手写 `containsKey` 判断。

### 遍历方式

```java
Map<Character, Integer> map = new HashMap<>();

// 遍历键值对（最常用）
for (Map.Entry<Character, Integer> e : map.entrySet()) {
    char k = e.getKey();
    int v = e.getValue();
}

// 只遍历 key 或 value
for (char k : map.keySet()) { }
for (int v : map.values()) { }

// JDK 8+ 函数式遍历（不要在内部修改 map）
map.forEach((k, v) -> { });
```

### TreeMap 的区间能力

```java
TreeMap<Integer, String> map = new TreeMap<>();
map.put(1, "a"); map.put(3, "c"); map.put(5, "e");

map.firstKey();      // 1
map.lastKey();       // 5
map.floorKey(4);     // 3，小于等于 4 的最大 key
map.ceilingKey(4);   // 5，大于等于 4 的最小 key
map.lowerKey(3);     // 1，严格小于 3 的最大 key
map.higherKey(3);    // 5，严格大于 3 的最小 key
map.headMap(3);      // key < 3 的部分
map.tailMap(3);      // key >= 3 的部分
map.subMap(1, 5);    // [1, 5)，左闭右开

// 端点 Entry 操作：空 map 时 xxxEntry() 返回 null，而 xxxKey() 会抛 NoSuchElementException
map.firstEntry();        // 最小 key 的 Entry
map.lastEntry();         // 最大 key 的 Entry
map.pollFirstEntry();    // 弹出并返回最小 key 的 Entry（调度、区间类题目常用）
map.pollLastEntry();     // 弹出并返回最大 key 的 Entry
map.descendingMap();     // 降序视图（不改变原 map）
```

### Map 的三个常见坑

```java
Map<String, Integer> map = new HashMap<>();
map.put("a", 0);

// 坑一：get 返回 null 无法区分"key 不存在"和"value 为 null"
Integer v = map.get("b");          // null
boolean exists = map.containsKey("b");  // false，需要用 containsKey 判断存在性

// 坑二：value 是 Integer 时，直接用 == 比较可能因缓存问题出错
Integer x = map.get("a");
// 应使用 Objects.equals(x, 0) 或 x != null && x == 0（与常量比较会触发拆箱）

// 坑三：不同 Map 对 null 的容忍度不一样
HashMap<String, Integer> hashMap = new HashMap<>();
hashMap.put(null, 1);              // 允许：最多一个 null key、任意多个 null value
hashMap.put("k", null);            // 允许

TreeMap<String, Integer> treeMap = new TreeMap<>();
// treeMap.put(null, 1);           // 抛 NullPointerException，因为要拿 key 排序比较
```

## 栈与队列：ArrayDeque

### 为什么不用 Stack 和 LinkedList

- `Stack` 继承自 `Vector`，**所有方法都加 `synchronized`**，单线程算法题里纯属浪费；而且它的 API 设计（`push`/`pop` 与 `Deque` 混用）容易出错。
- `LinkedList` 每个节点都有额外的指针开销，`get(i)` 还是 `O(n)`。
- **结论：栈和队列统一用 `ArrayDeque`**（数组实现的双端队列，两端操作均摊 `O(1)`，无同步开销）。

> 唯一例外：需要存 `null` 时不能用 `ArrayDeque`（它不允许 null），这种情况极少。

### 三种角色

同一个 `Deque` 接口既能当栈、又能当队列、还能当双端队列，区别只在于你调用哪一组方法：

```java
// 作为栈（后进先出）：只在同一端（头部）进出
Deque<Integer> stack = new ArrayDeque<>();
stack.push(1);        // 等价 addFirst，压栈
stack.push(2);
stack.peek();         // 2，看栈顶不删除
stack.pop();          // 2，弹出栈顶

// 作为队列（先进先出）：尾部进、头部出
Deque<Integer> queue = new ArrayDeque<>();
queue.offer(1);       // 等价 offerLast，入队
queue.offer(2);
queue.peek();         // 1，看队头不删除
queue.poll();         // 1，出队

// 作为双端队列：两端都能进出
Deque<Integer> deque = new ArrayDeque<>();
deque.offerFirst(1);  // 头部插入
deque.offerLast(2);   // 尾部插入
deque.peekFirst();    // 看头部
deque.peekLast();     // 看尾部
deque.pollFirst();    // 头部弹出
deque.pollLast();     // 尾部弹出

// 构造时预设容量，避免反复扩容
Deque<Integer> big = new ArrayDeque<>(1000);
```

### Deque 完整方法表（按"操作位置 × 失败行为"组织）

`Deque` 的方法看着多，其实只要抓住两个维度就能全部串起来：**动的是哪一端**，以及**失败时是抛异常还是返回特殊值**。这张表比死背方法名有用得多：

| 操作位置 | 典型用途 | 失败时抛异常                           | 失败时返回特殊值            |
| -------- | -------- | -------------------------------------- | --------------------------- |
| 头部插入 | 栈       | `addFirst(e)` / `push(e)`              | `offerFirst(e)`             |
| 尾部插入 | 队列     | `addLast(e)` / `add(e)`                | `offerLast(e)` / `offer(e)` |
| 头部取出 | 栈       | `removeFirst()` / `pop()` / `remove()` | `pollFirst()` / `poll()`    |
| 尾部取出 |          | `removeLast()`                         | `pollLast()`                |
| 头部查看 | 栈       | `getFirst()` / `element()`             | `peekFirst()` / `peek()`    |
| 尾部查看 |          | `getLast()`                            | `peekLast()`                |

- **抛异常**那一列：deque 为空时取元素抛 `NoSuchElementException`；插入 `null` 抛 `NullPointerException`。
- **返回特殊值**那一列：取不到返回 `null`，插不进去返回 `false`（`ArrayDeque` 几乎不会满，所以插入时基本不会返回 `false`）。
- `add`/`remove`/`element` 是从 `Queue` 接口继承来的别名，分别等价于 `addLast`/`removeFirst`/`getFirst`；`push`/`pop` 是 `Deque` 提供的栈别名，分别等价于 `addFirst`/`removeFirst`。所以前面栈和队列的写法，本质上都是这张表里方法的"马甲"。

> **为什么设计成两套？** 因为队列存在"容量受限"的场景（如各种阻塞队列），`offer`/`poll` 用返回值表达失败，不会打断正常流程；而 `add`/`remove` 用异常表达失败，适合"这里必须成功，失败就是 bug"的场景。落到 `ArrayDeque` 上，两套方法在**插入**时的差别几乎为零，但**空 deque 取出**时的差别是实打实的：写单调队列时用 `pollFirst()` 可以省掉一次 `isEmpty()` 判断，换成 `removeFirst()` 就必须先判空，否则直接抛异常。

### 其余常用操作

```java
Deque<Integer> deque = new ArrayDeque<>(List.of(1, 2, 3)); // 顺序：head=1 → tail=3

deque.size();                    // 元素个数
deque.isEmpty();                 // 是否为空
deque.contains(2);               // O(n)，线性查找
deque.clear();                   // 清空

deque.removeFirstOccurrence(2);  // 从头往尾删第一个等于 2 的元素，返回 boolean
deque.removeLastOccurrence(2);   // 从尾往头删第一个等于 2 的元素，返回 boolean

// 两个方向的迭代器：iterator 从 head 到 tail，descendingIterator 反过来
for (int x : deque) { }                              // head → tail
Iterator<Integer> it = deque.descendingIterator();   // tail → head
```

> `Deque` **不支持按索引访问**（没有 `get(i)`），想随机访问得换 `ArrayList`；`ArrayDeque` 的遍历顺序固定是 head → tail，这点和无序的 `HashSet` 不同。

**记忆要点**：`push`/`pop`/`peek` 是栈语义（操作头部）；`offer`/`poll`/`peek` 是队列语义（尾部进、头部出）。但真正要记牢的是"抛异常 vs 返回特殊值"这两列——它决定了你要不要做空判断。

### 单调栈模板

场景：下一个更大元素、柱状图最大矩形、每日温度。**栈里存下标**，便于计算距离和处理相等元素：

```java
// 求每个元素右侧第一个更大元素的下标，不存在为 -1
int[] nextGreater(int[] nums) {
    int n = nums.length;
    int[] res = new int[n];
    Arrays.fill(res, -1);
    Deque<Integer> stack = new ArrayDeque<>();   // 存下标，保持对应值单调递减
    for (int i = 0; i < n; i++) {
        while (!stack.isEmpty() && nums[stack.peek()] < nums[i]) {
            res[stack.pop()] = i;                // 出栈时结算答案
        }
        stack.push(i);
    }
    return res;
}
```

### 单调队列模板

场景：滑动窗口最大值、窗口内最值。**队头过期元素要弹出，队尾不满足单调性的元素要弹出**：

```java
// 滑动窗口最大值，窗口大小 k
int[] maxSlidingWindow(int[] nums, int k) {
    int n = nums.length;
    int[] res = new int[n - k + 1];
    Deque<Integer> deque = new ArrayDeque<>();  // 存下标，对应值单调递减
    for (int i = 0; i < n; i++) {
        // 1. 队头超出窗口范围则弹出
        if (!deque.isEmpty() && deque.peekFirst() <= i - k) {
            deque.pollFirst();
        }
        // 2. 队尾对应值比当前值小则弹出，保持单调递减
        while (!deque.isEmpty() && nums[deque.peekLast()] <= nums[i]) {
            deque.pollLast();
        }
        deque.offerLast(i);
        // 3. 窗口形成后，队头即为最大值
        if (i >= k - 1) {
            res[i - k + 1] = nums[deque.peekFirst()];
        }
    }
    return res;
}
```

## PriorityQueue（堆）

### 建堆与三种比较器写法

```java
// 小顶堆（默认，自然顺序）
PriorityQueue<Integer> minHeap = new PriorityQueue<>();

// 大顶堆
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Comparator.reverseOrder());

// int[] 或自定义对象：按第一个字段升序（int[] 没有自然顺序，必须显式给比较器）
PriorityQueue<int[]> pq = new PriorityQueue<>(Comparator.comparingInt(a -> a[0]));

// 完整写法（等价，可读性更强，适合复杂比较）
PriorityQueue<int[]> pq2 = new PriorityQueue<>((a, b) -> {
    if (a[0] != b[0]) {
        return Integer.compare(a[0], b[0]);
    }
    return Integer.compare(a[1], b[1]);
});
```

### 常用方法

```java
PriorityQueue<Integer> heap = new PriorityQueue<>();

heap.offer(3);          // 入堆，O(log n)（add 与 offer 完全等价）
heap.peek();            // 看堆顶，O(1)，空堆返回 null
heap.poll();            // 弹出堆顶，O(log n)，空堆返回 null
heap.size();
heap.isEmpty();
heap.contains(3);       // O(n)，堆内查找是线性的
heap.remove(3);         // remove(Object)：按值删任意元素，O(n)，要尽量避免
heap.remove();          // remove()：弹出堆顶，空堆抛 NoSuchElementException
heap.element();         // 等价 peek，但空堆抛 NoSuchElementException
heap.clear();           // 清空
Integer[] arr = heap.toArray(new Integer[0]);  // 注意：是堆的内部顺序，不是有序结果

// 一次性建堆：从集合构造是 O(n)，比逐个 offer 的 O(n log n) 更快
PriorityQueue<Integer> fromList = new PriorityQueue<>(list);

// 注意：直接遍历堆不是有序的！要有序输出必须反复 poll
while (!heap.isEmpty()) {
    System.out.print(heap.poll() + " ");
}
```

> **堆没有"按位置删除"**：想删除堆中任意元素只能用 `remove(Object)`，它是 `O(n)`，算法题里要尽量避免。空堆上 `poll()` 返回 `null`，而 `remove()` 抛 `NoSuchElementException`——和 `Deque` 是同一套设计哲学。
>
> `PriorityQueue` **不允许 `null` 元素**（`offer(null)` 抛 `NPE`），`iterator()` 也不保证顺序，所以别用 for-each 去"看堆里的最小值"。

### 三个典型用法

**① Top K：维护大小为 K 的堆**

```java
// 求前 K 大：小顶堆，堆顶是这 K 个里最小的，超过 K 就淘汰堆顶
int[] topK(int[] nums, int k) {
    PriorityQueue<Integer> heap = new PriorityQueue<>();
    for (int num : nums) {
        heap.offer(num);
        if (heap.size() > k) {
            heap.poll();
        }
    }
    int[] res = new int[k];
    for (int i = k - 1; i >= 0; i--) {
        res[i] = heap.poll();     // 倒序填充得到降序结果
    }
    return res;
}
```

**② 合并 K 个有序链表：堆里存节点**

```java
ListNode mergeKLists(ListNode[] lists) {
    PriorityQueue<ListNode> heap = new PriorityQueue<>(Comparator.comparingInt(n -> n.val));
    for (ListNode node : lists) {
        if (node != null) {
            heap.offer(node);
        }
    }
    ListNode dummy = new ListNode(0), cur = dummy;
    while (!heap.isEmpty()) {
        ListNode node = heap.poll();
        cur.next = node;
        cur = cur.next;
        if (node.next != null) {
            heap.offer(node.next);
        }
    }
    return dummy.next;
}
```

**③ 双堆求数据流中位数：大顶堆存较小一半，小顶堆存较大一半**

```java
class MedianFinder {
    private final PriorityQueue<Integer> small = new PriorityQueue<>(Comparator.reverseOrder()); // 较小的一半
    private final PriorityQueue<Integer> large = new PriorityQueue<>();                          // 较大的一半

    public void addNum(int num) {
        small.offer(num);                 // 先入小的一半
        large.offer(small.poll());        // 再把小的一半里最大的给大的一半
        if (large.size() > small.size()) { // 平衡两个堆的大小差不超过 1
            small.offer(large.poll());
        }
    }

    public double findMedian() {
        return small.size() > large.size()
                ? small.peek()
                : (small.peek() + large.peek()) / 2.0;
    }
}
```

## 排序与比较器

### 原始类型数组的升序与降序

```java
int[] nums = {3, 1, 2};
Arrays.sort(nums);                              // 升序

// 想要降序的三种做法
// 1. 升序后倒序遍历（最省事，无装箱）
for (int i = nums.length - 1; i >= 0; i--) { }

// 2. 转为 Integer[] 再排（有装箱开销）
Integer[] boxed = Arrays.stream(nums).boxed().toArray(Integer[]::new);
Arrays.sort(boxed, Comparator.reverseOrder());

// 3. 存负数（仅适用于取值明确较小的场景，注意溢出风险）
```

### List 排序

```java
List<Integer> list = new ArrayList<>(List.of(3, 1, 2));
list.sort(Comparator.naturalOrder());                  // 升序
list.sort(Comparator.reverseOrder());                  // 降序
Collections.sort(list);                                // 等价写法
```

### 自定义对象与多级排序

```java
class Student {
    String name;
    int score;
    int age;
}

List<Student> students = new ArrayList<>();

// 按 score 升序
students.sort(Comparator.comparingInt(s -> s.score));

// 按 score 降序
students.sort(Comparator.comparingInt((Student s) -> s.score).reversed());

// 先按 score 降序，score 相同再按 age 升序（多级排序）
students.sort(Comparator.comparingInt((Student s) -> s.score).reversed()
        .thenComparingInt(s -> s.age));

// null 值放到最后（用字段访问时也要显式写出参数类型）
students.sort(Comparator.comparing((Student s) -> s.name,
        Comparator.nullsLast(String::compareTo)));
```

> 当 lambda 的类型推断失败时（如 `comparingInt` 用在链式写法中），显式写出参数类型 `(Student s) -> s.score` 即可解决。

### Comparable 与 Comparator 的区别

| 对比项   | `Comparable`                        | `Comparator`                            |
| -------- | ----------------------------------- | --------------------------------------- |
| 所在位置 | 由**被排序的类**实现（`compareTo`） | 独立的外部比较器（`compare`）           |
| 排序规则 | 只有一种"自然顺序"                  | 可以定义任意多种排序规则                |
| 使用方式 | `Arrays.sort(arr)` 自动使用         | `Arrays.sort(arr, comparator)` 显式传入 |
| 侵入性   | 需要修改类本身                      | 不修改类，随用随写                      |

### 排序稳定性（面试常问）

- **对象数组 / List**：`Arrays.sort(Object[])`、`Collections.sort` 使用 **TimSort，稳定**（相等元素保持原相对顺序）。多级排序能生效正是依赖稳定性。
- **原始类型数组**：`Arrays.sort(int[])` 使用**双轴快排（Dual-Pivot Quicksort），不稳定**，但更快、不需要额外空间。
- 如果需要原始类型也稳定，只能转为对象数组排序（代价是装箱）。

## 位运算与 BitSet

### 位运算常用技巧

```java
int x = 5;                  // 二进制 101

x & 1;                      // 判奇偶：1 为奇数
x | (1 << 3);               // 把第 3 位置 1
x & ~(1 << 0);              // 把第 0 位清 0
(x >> 2) & 1;               // 取第 2 位
x ^ (1 << 1);               // 翻转第 1 位
Integer.bitCount(x);        // 二进制中 1 的个数
Integer.toBinaryString(x);  // 转二进制字符串
```

### BitSet

用位存储布尔状态，比 `boolean[]` 省内存，且支持批量集合运算：

```java
BitSet bs = new BitSet(128);   // 预设容量（按 64 位对齐，不够会自动扩容）
bs.set(3);                  // 置位
bs.get(3);                  // 取值，boolean
bs.clear(3);                // 清除某一位
bs.flip(3);                 // 翻转某一位（0 ↔ 1）
bs.set(10, 20);             // 区间置位 [10, 20)，左闭右开
bs.clear(10, 20);           // 区间清除
bs.isEmpty();               // 是否所有位都是 0
bs.cardinality();           // 值为 1 的位数
bs.length();                // 最高置位下标 + 1（不是容量）
bs.size();                  // 实际分配的位数（按 64 向上取整）
bs.nextSetBit(0);           // 从 0 往后第一个为 1 的下标，没有返回 -1
bs.nextClearBit(0);         // 从 0 往后第一个为 0 的下标
bs.previousSetBit(bs.length() - 1); // 往前第一个为 1 的下标

// 集合运算（原地修改，所以先 clone 再算）
BitSet a = new BitSet(); a.set(1);
BitSet b = new BitSet(); b.set(2);
BitSet tmp = (BitSet) a.clone(); tmp.and(b);      // 交集 a & b
tmp = (BitSet) a.clone();        tmp.or(b);       // 并集 a | b
tmp = (BitSet) a.clone();        tmp.xor(b);      // 异或 a ^ b
tmp = (BitSet) a.clone();        tmp.andNot(b);   // 差集 a & ~b
```

典型场景：海量整数去重/排序、字符串字符集标记（如"单词中的字母"）、状态压缩 DP 的辅助结构。

## 算法题常见套路（集合视角）

这一节把上面的 API 串成"看到题型就想到写法"的条件反射。

### 计数：计数数组 vs HashMap

| 选择                   | 条件                                  |
| ---------------------- | ------------------------------------- |
| `int[26]` / `int[128]` | 字符集固定且范围小（小写字母、ASCII） |
| `HashMap<K, Integer>`  | key 是任意对象、字符串、大范围整数    |

```java
// HashMap 计数（含频率）
Map<Integer, Integer> freq = new HashMap<>();
for (int num : nums) {
    freq.merge(num, 1, Integer::sum);
}

// 取前 K 高频：先计数，再对小顶堆做 Top K
PriorityQueue<Map.Entry<Integer, Integer>> heap =
        new PriorityQueue<>(Comparator.comparingInt(Map.Entry::getValue));
for (Map.Entry<Integer, Integer> e : freq.entrySet()) {
    heap.offer(e);
    if (heap.size() > k) {
        heap.poll();
    }
}
```

### 前缀和 + HashMap

场景：和为 K 的子数组、连续子数组和可被 K 整除、最长连续序列的和条件。

```java
// 统计和为 k 的连续子数组个数
int subarraySum(int[] nums, int k) {
    Map<Integer, Integer> prefixCount = new HashMap<>();
    prefixCount.put(0, 1);          // 空前缀，处理"从下标 0 开始"的情况
    int sum = 0, res = 0;
    for (int num : nums) {
        sum += num;
        res += prefixCount.getOrDefault(sum - k, 0);  // 有多少个历史前缀满足条件
        prefixCount.merge(sum, 1, Integer::sum);
    }
    return res;
}
```

### 滑动窗口 + 计数容器

场景：最长无重复子串、最小覆盖子串、最多包含 K 种字符的最长子串。

```java
// 最长无重复字符子串
int lengthOfLongestSubstring(String s) {
    Map<Character, Integer> lastIndex = new HashMap<>();
    int left = 0, res = 0;
    for (int right = 0; right < s.length(); right++) {
        char c = s.charAt(right);
        if (lastIndex.containsKey(c)) {
            left = Math.max(left, lastIndex.get(c) + 1);   // 左边界只能右移，不能回退
        }
        lastIndex.put(c, right);
        res = Math.max(res, right - left + 1);
    }
    return res;
}
```

### 邻接表建图（BFS/DFS 前置）

```java
// 用 List<List<Integer>> 建无向图
List<List<Integer>> graph = new ArrayList<>();
for (int i = 0; i < n; i++) {
    graph.add(new ArrayList<>());
}
for (int[] edge : edges) {
    graph.get(edge[0]).add(edge[1]);
    graph.get(edge[1]).add(edge[0]);
}

// 也可以用 Map 建图（节点编号不连续或为字符串时）
Map<String, List<String>> graph2 = new HashMap<>();
for (String[] edge : edges) {
    graph2.computeIfAbsent(edge[0], k -> new ArrayList<>()).add(edge[1]);
    graph2.computeIfAbsent(edge[1], k -> new ArrayList<>()).add(edge[0]);
}
```

### 拓扑排序（入度数组 + 队列）

```java
int[] topologicalSort(int n, int[][] prerequisites) {
    List<List<Integer>> graph = new ArrayList<>();
    for (int i = 0; i < n; i++) {
        graph.add(new ArrayList<>());
    }
    int[] indegree = new int[n];
    for (int[] p : prerequisites) {
        graph.get(p[1]).add(p[0]);
        indegree[p[0]]++;
    }
    Deque<Integer> queue = new ArrayDeque<>();
    for (int i = 0; i < n; i++) {
        if (indegree[i] == 0) {
            queue.offer(i);
        }
    }
    int[] order = new int[n];
    int idx = 0;
    while (!queue.isEmpty()) {
        int cur = queue.poll();
        order[idx++] = cur;
        for (int next : graph.get(cur)) {
            if (--indegree[next] == 0) {
                queue.offer(next);
            }
        }
    }
    return idx == n ? order : new int[0];   // 长度不足说明有环
}
```

### 并查集（数组 + 路径压缩）

```java
class UnionFind {
    private final int[] parent;
    private int count;

    UnionFind(int n) {
        parent = new int[n];
        for (int i = 0; i < n; i++) {
            parent[i] = i;
        }
        count = n;
    }

    int find(int x) {                       // 路径压缩，均摊 O(log n)；再加按秩合并才是 O(α(n))
        if (parent[x] != x) {
            parent[x] = find(parent[x]);
        }
        return parent[x];
    }

    void union(int x, int y) {              // 合并两个集合
        int rootX = find(x), rootY = find(y);
        if (rootX != rootY) {
            parent[rootX] = rootY;
            count--;
        }
    }

    boolean connected(int x, int y) {
        return find(x) == find(y);
    }
}
```

## 常见陷阱清单（考前必看）

按踩坑频率从高到低排列：

1. **`Arrays.asList` 返回定长视图**：`add`/`remove` 抛 `UnsupportedOperationException`，需要可变列表时用 `new ArrayList<>(...)`。
2. **`list.remove(1)` 删的是下标**：按值删除要用 `list.remove(Integer.valueOf(1))`。
3. **`int[]` 不能传比较器**：`Arrays.sort(int[], Comparator)` 不存在，需要转 `Integer[]` 或改用升序 + 倒序遍历。
4. **比较器用减法会溢出**：写 `(a, b) -> a - b` 在极端值下排序错乱，统一用 `Integer.compare(a, b)`。
5. **`Integer` 的 `==` 陷阱**：`Integer` 缓存只覆盖 -128~127，超出范围 `==` 比较的是引用，必须用 `equals` 或先拆箱。
6. **`HashMap.get` 返回 null 有两义**：无法区分"key 不存在"和"value 是 null"，判断存在性用 `containsKey`。
7. **遍历中直接删除元素**：会抛 `ConcurrentModificationException`，用 `Iterator.remove`、倒序遍历或 `removeIf`。
8. **`ArrayDeque` 不允许 null**：`offer(null)`/`push(null)` 抛 `NullPointerException`。
9. **堆遍历无序**：`for (int x : heap)` 不是有序结果，要有序必须反复 `poll`。
10. **`Arrays.sort` 原地修改**：需要保留原数组时先 `copyOf`。
11. **`TreeMap`/`TreeSet` 用自定义对象必须可比**：否则抛 `ClassCastException`。
12. **`String.split` 的分隔符是正则**：`split(".")`、`split("|")` 等需要转义，如 `split("\\.")`；末尾空串默认被丢弃，需要保留时传 `-1` 作为 limit。
13. **别把 `subList` 当拷贝**：`subList(from, to)` 返回的是**原列表的视图**，改它会改原列表；要独立副本请用 `new ArrayList<>(list.subList(from, to))`。注意 `substring` 不同，它返回的是新字符串（JDK 7+ 起就是拷贝，不是视图）。
14. **字符串拼接用 `StringBuilder`**：循环里用 `+` 会不断创建新对象，复杂度从 `O(n)` 退化为 `O(n²)`。
15. **自动装箱的性能损耗**：大数据量的 `Map<Integer, Integer>` 比 `int[]` 计数数组慢很多，能用数组就用数组。
16. **`Arrays.asList(原始类型数组)` 陷阱**：`Arrays.asList(new int[]{1,2,3})` 得到的是长度为 1 的 `List<int[]>`，不是 `List<Integer>`，想要 `List<Integer>` 得先 `boxed()`。
17. **`List.of`/`Set.of`/`Map.of` 不可变且拒绝 null**：对它们 `add`/`remove` 抛 `UnsupportedOperationException`，元素为 `null` 抛 `NPE`；`Map.of` 最多支持 10 对键值。
18. **`TreeMap` 的 key 不能为 null**：`put(null, v)` 抛 `NPE`（要对 key 排序比较），而 `HashMap` 允许一个 `null` key。
19. **无序容器的遍历顺序不可依赖**：`HashSet`、`HashMap`、`PriorityQueue` 的迭代顺序都不保证，需要顺序请换 `LinkedHashSet`/`LinkedHashMap`/`TreeSet`/`TreeMap`。
20. **空容器上的"取元素"方法行为不同**：`peek`/`poll` 返回 `null`，`element`/`remove`/`first`/`last` 等则抛 `NoSuchElementException`，用之前先想清楚要不要判空。

## 高频问题自测

- 去重、计数、映射、有序查询分别该选什么容器？
- `HashMap` 的 `getOrDefault`、`computeIfAbsent`、`merge` 分别适合什么场景？
- 为什么算法题里建议用 `ArrayDeque` 而不是 `Stack` 和 `LinkedList`？
- `ArrayDeque` 作为栈和作为队列时，方法名分别是什么？`add`/`offer`、`remove`/`poll`、`get`/`peek` 两组方法在失败时的行为有什么本质区别？
- 单调栈和单调队列分别解决什么问题？为什么存下标而不是存值？
- `PriorityQueue` 的默认顺序是什么？怎么改成大顶堆？
- `Arrays.sort(int[])` 和 `Arrays.sort(Integer[])` 在稳定性和比较器支持上有什么区别？
- 为什么比较器里不推荐写 `a - b`？
- `HashSet` 和 `TreeSet` 的时间复杂度、适用场景分别是什么？
- `int[26]` 计数数组和 `HashMap` 计数分别适合什么条件？
- 各容器的增删查复杂度分别是多少？

## 推荐练习题

按"集合操作"这个角度挑选的题，建议每类至少手写一遍：

**哈希计数与去重**

- [1. 两数之和](https://leetcode.cn/problems/two-sum/)
- [217. 存在重复元素](https://leetcode.cn/problems/contains-duplicate/)
- [242. 有效的字母异位词](https://leetcode.cn/problems/valid-anagram/)
- [49. 字母异位词分组](https://leetcode.cn/problems/group-anagrams/)
- [128. 最长连续序列](https://leetcode.cn/problems/longest-consecutive-sequence/)

**前缀和与滑动窗口**

- [560. 和为 K 的子数组](https://leetcode.cn/problems/subarray-sum-equals-k/)
- [3. 无重复字符的最长子串](https://leetcode.cn/problems/longest-substring-without-repeating-characters/)
- [76. 最小覆盖子串](https://leetcode.cn/problems/minimum-window-substring/)

**栈与单调栈、队列与单调队列**

- [20. 有效的括号](https://leetcode.cn/problems/valid-parentheses/)
- [155. 最小栈](https://leetcode.cn/problems/min-stack/)
- [739. 每日温度](https://leetcode.cn/problems/daily-temperatures/)
- [84. 柱状图中最大的矩形](https://leetcode.cn/problems/largest-rectangle-in-histogram/)
- [239. 滑动窗口最大值](https://leetcode.cn/problems/sliding-window-maximum/)

**堆与优先级队列**

- [215. 数组中的第 K 个最大元素](https://leetcode.cn/problems/kth-largest-element-in-an-array/)
- [347. 前 K 个高频元素](https://leetcode.cn/problems/top-k-frequent-elements/)
- [23. 合并 K 个升序链表](https://leetcode.cn/problems/merge-k-sorted-lists/)
- [295. 数据流的中位数](https://leetcode.cn/problems/find-median-from-data-stream/)

**有序集合与区间**

- [729. 我的日程安排表 I](https://leetcode.cn/problems/my-calendar-i/)
- [146. LRU 缓存](https://leetcode.cn/problems/lru-cache/)

**图与并查集**

- [207. 课程表](https://leetcode.cn/problems/course-schedule/)
- [200. 岛屿数量](https://leetcode.cn/problems/number-of-islands/)
- [547. 省份数量](https://leetcode.cn/problems/number-of-provinces/)

## 相关文章

- [算法专题知识体系](./)：复杂度分析、模板与刷题路线
- [Top K 问题面试题总结](./top-k.md)：堆、快排分区、桶计数的完整对比
- [哈希表面试题总结](../data-structure/hash-table.md)：哈希冲突、扩容与 Java HashMap 原理
- [堆结构面试题总结](../data-structure/heap.md)：堆的实现与应用
- [Java 集合常见面试题总结（上）](../../java/collection/java-collection-questions-01.md)
- [Java 集合常见面试题总结（下）](../../java/collection/java-collection-questions-02.md)
- [Java 集合使用注意事项总结](../../java/collection/java-collection-precautions-for-use.md)
- [PriorityQueue 源码分析](../../java/collection/priorityqueue-source-code.md)

## 参考资料

- Java SE API 文档：[java.util 包](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/package-summary.html)
- Java SE API 文档：[java.util.Arrays](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Arrays.html)
- [Oracle Java Tutorials：The Collections Framework](https://docs.oracle.com/javase/tutorial/collections/index.html)
- 《Java 核心技术 卷 I》
- 《算法（第 4 版）》

<!-- @include: @article-footer.snippet.md -->
