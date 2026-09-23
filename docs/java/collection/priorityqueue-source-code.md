---
title: PriorityQueue 源码分析
description: PriorityQueue源码深度解析：详解基于二叉堆的优先队列实现、构造与heapify建堆、offer/poll核心流程、siftUp/siftDown源码逐行分析、Comparator自定义排序、grow扩容机制、迭代器与常见面试题。
category: Java
tag:
  - Java集合
head:
  - - meta
    - name: keywords
      content: PriorityQueue源码,优先队列,二叉堆,小顶堆,大顶堆,堆排序,Comparator,heapify,siftUp,siftDown,扩容,Top-K
---

`PriorityQueue` 是 Java 集合框架中的**优先队列**实现，底层基于**二叉堆（Binary Heap）**，用于按优先级顺序取出元素（默认小顶堆）。它常被用于实现延时队列（`DelayQueue` 的底层）、定时任务调度、Top-K 问题、Dijkstra 最短路等场景。

> 说明：本文源码基于 JDK 17。`PriorityQueue` 与 `PriorityBlockingQueue` 的关系是：后者是前者加了锁的线程安全版本，底层堆算法完全一致。

## 核心特性

- **基于数组的二叉堆**：底层是 `Object[] queue` 数组，通过数组下标模拟完全二叉树（**不是链表**）。
- **默认小顶堆**：队首（`queue[0]`）元素始终是优先级最高（最小）的元素；可通过构造器传入 `Comparator` 实现自定义排序（如大顶堆、按对象字段排序）。
- **非线程安全**：多线程场景需要使用 `PriorityBlockingQueue`（加锁 + 条件队列）。
- **不允许 null 元素**：堆化比较时会抛出 NPE（`Comparator` 或 `Comparable.compareTo` 无法处理 null）。
- **无界队列**：内部数组会自动扩容，但受 `MAX_ARRAY_SIZE`（`Integer.MAX_VALUE - 8`）上限约束。

## 类结构

```java
public class PriorityQueue<E> extends AbstractQueue<E>
        implements java.io.Serializable {

    private static final int DEFAULT_INITIAL_CAPACITY = 11;

    // 存储堆元素的数组，下标 0 是堆顶
    transient Object[] queue;

    // 元素个数（注意：size 与 queue.length 含义不同）
    int size;

    // 自定义比较器；为 null 时使用元素的自然顺序（Comparable）
    private final Comparator<? super E> comparator;

    // 结构性修改次数，用于迭代器 fail-fast
    transient int modCount;
    ...
}
```

## 二叉堆结构

**完全二叉树的数组表示**（下标从 0 开始）：

- 父节点下标：`(i - 1) >>> 1`（即 `(i-1)/2`）
- 左子节点下标：`2 * i + 1`
- 右子节点下标：`2 * i + 2`

**堆性质（小顶堆）**：每个父节点的值 ≤ 其两个子节点的值。因此：

- 堆顶 `queue[0]` 是**全局最小元素**；
- 但**堆不是有序的**——你只能 O(1) 拿到最小元素，其余元素之间没有顺序保证；
- 插入/删除的时间复杂度都是 **O(log n)**。

```java
// 示例：向队列中依次加入 3, 1, 2，堆顶始终是最小的 1
PriorityQueue<Integer> pq = new PriorityQueue<>();
pq.offer(3);
pq.offer(1);
pq.offer(2);
pq.peek();   // 1
pq.poll();   // 1（取出后堆自动调整，peek 变为 2）
```

## 构造方法与初始化

PriorityQueue 提供多个构造器，关键是 `Collection` 和 `SortedSet` 构造器中的 **`heapify()`（建堆）** 过程：

```java
// 用集合初始化：直接复制数组后原地建堆，复杂度 O(n)
public PriorityQueue(Collection<? extends E> c) {
    if (c instanceof SortedSet<?> sortedSet) {
        this.comparator = (Comparator<? super E>) sortedSet.comparator();
        initElementsFromCollection(sortedSet);
    } else if (c instanceof PriorityQueue<?> pq) {
        this.comparator = (Comparator<? super E>) pq.comparator();
        initFromPriorityQueue(pq);
    } else {
        this.comparator = null;
        initFromCollection(c);
    }
}

private void initFromCollection(Collection<? extends E> c) {
    initElementsFromCollection(c);
    heapify();
}
```

`heapify()` 的核心：**从最后一个非叶子节点开始，从下往上逐个 siftDown**。最后一个非叶子节点的下标是 `(size >>> 1) - 1`：

```java
private void heapify() {
    final Object[] es = queue;
    int n = size, i = (n >>> 1) - 1;   // 从最后一个非叶子节点开始
    if (comparator == null)
        for (; i >= 0; i--)
            siftDownComparable(i, (E) es[i]);
    else
        for (; i >= 0; i--)
            siftDownUsingComparator(i, (E) es[i]);
}
```

> **为什么是 O(n) 而不是 O(n log n)？** 因为大部分节点都在堆的下层，深度小，下沉很快。精确分析：高度为 h 的节点有 n/2^(h+1) 个，每个下沉代价 O(h)，总代价为调和级数收敛于 O(n)。这也是 `Heap` 建堆的经典结论。

## 核心操作：offer/add（插入）

`add` 内部调用 `offer`：

```java
public boolean offer(E e) {
    if (e == null)
        throw new NullPointerException();       // 不允许 null
    modCount++;
    int i = size;
    if (i >= queue.length)
        grow(i + 1);                            // 扩容
    siftUp(i, e);                               // 放在末尾，向上调整
    size = i + 1;
    return true;
}
```

流程：新元素先放到数组末尾（最后一个叶子），然后 **siftUp 上浮**——不断与父节点比较，若小于父节点则向上交换，直到满足堆性质。

### siftUp 源码（默认比较器）

```java
private void siftUpComparable(int k, E x) {
    Comparable<? super E> key = (Comparable<? super E>) x;
    while (k > 0) {
        int parent = (k - 1) >>> 1;      // 父节点下标
        Object e = queue[parent];
        if (key.compareTo((E) e) >= 0)   // 新元素 >= 父节点，堆性质已满足
            break;
        queue[k] = e;                    // 父节点下沉（只搬元素，不交换）
        k = parent;
    }
    queue[k] = key;                      // 找到最终位置
}
```

> **优化细节**：上浮时不是"每轮交换两个元素"，而是先把较大的父节点**下移**，最后把新元素一次性写入最终位置，减少了赋值次数。`siftUpUsingComparator` 结构完全相同，只是把 `compareTo` 换成 `comparator.compare`。

## 核心操作：poll（取出堆顶）

```java
public E poll() {
    final Object[] es;
    final E result;
    if ((result = (E) ((es = queue)[0])) != null) {
        modCount++;
        final int n;
        final E x = (E) es[(n = --size)];  // 最后一个元素
        es[n] = null;                       // 置空，帮助 GC
        if (n > 0)
            siftDown(0, x);                 // 用最后一个元素填补堆顶，向下调整
    }
    return result;
}
```

流程：用**最后一个元素**填补堆顶空缺，然后 **siftDown 下沉**——不断与左右子节点中**较小者**比较，若大于子节点则下移，直到满足堆性质。

### siftDown 源码（默认比较器）

```java
private void siftDownComparable(int k, E x) {
    Comparable<? super E> key = (Comparable<? super E>) x;
    int half = size >>> 1;                 // 非叶子节点的下标范围是 [0, half)
    while (k < half) {                     // 有左子节点才需要继续下沉
        int child = (k << 1) + 1;          // 左子节点
        int right = child + 1;             // 右子节点
        Object c = queue[child];
        if (right < size &&
            ((Comparable<? super E>) c).compareTo((E) queue[right]) > 0)
            c = queue[child = right];      // 取左右子节点中较小者
        if (key.compareTo((E) c) <= 0)     // 当前元素 <= 子节点中较小者，停止
            break;
        queue[k] = c;                      // 较小的子节点上移
        k = child;
    }
    queue[k] = key;
}
```

> **`half = size >>> 1` 的巧妙之处**：在完全二叉树中，下标 ≥ `size/2` 的节点一定是叶子节点（没有左子节点）。因此只需在 `k < half` 时循环，减少了不必要的比较。

## 核心操作：remove(Object)

`remove(o)` 与 `poll()` 的区别：删除的是**任意元素**，不是堆顶。实现分两步：**线性查找**（O(n)）+ **堆化调整**（O(log n)）：

```java
public boolean remove(Object o) {
    int i = indexOf(o);          // 线性遍历查找下标，O(n)
    if (i == -1)
        return false;
    modCount++;
    int s = --size;
    if (s == i)                  // 删除的就是最后一个元素，直接置空
        queue[i] = null;
    else {
        E moved = (E) queue[s];  // 最后一个元素
        queue[s] = null;
        siftDown(i, moved);      // 先尝试下沉
        if (queue[i] == moved) { // 没下沉（moved 仍在原位），说明 moved 小于子树，需要上浮
            siftUp(i, moved);
        }
    }
    return true;
}
```

> **为什么删任意元素要"先下沉再上浮"？** 用最后一个元素 `moved` 填补被删位置后，`moved` 与子树的关系未知：如果 `moved` 比子树大，需要下沉；如果 `moved` 比父节点小，需要上浮。`siftDown` 执行后若 `moved` 原地没动，说明子树方向已满足，但父节点方向可能违反，因此要再 `siftUp` 一次。两个方向都检查才保证堆性质完整。

## 扩容机制：grow

```java
private void grow(int minCapacity) {
    int oldCapacity = queue.length;
    // 容量小于 64 时翻倍再加 2；否则扩容 1.5 倍
    int newCapacity = oldCapacity + ((oldCapacity < 64)
                                     ? (oldCapacity + 2)
                                     : (oldCapacity >> 1));
    // 溢出保护
    if (newCapacity - MAX_ARRAY_SIZE > 0)
        newCapacity = hugeCapacity(minCapacity);
    queue = Arrays.copyOf(queue, newCapacity);
}
```

扩容规则与 `ArrayList` 类似：

- 容量 < 64：`new = old * 2 + 2`（快速翻倍，减少扩容次数）；
- 容量 ≥ 64：`new = old * 1.5`（放缓增长，避免浪费内存）。

扩容只是申请更大的数组并**整体拷贝**，不会破坏堆结构（堆性质完全由 siftUp/siftDown 维护，数组下标关系不变）。

## peek

```java
public E peek() {
    return (E) queue[0];   // 直接返回堆顶，O(1)，不调整
}
```

## 迭代器与 fail-fast

`PriorityQueue` 的迭代器遍历的是**底层数组顺序**，**不是堆序**，因此迭代输出的顺序与 `poll()` 取出的顺序不同（这是常见误用点）。

```java
PriorityQueue<Integer> pq = new PriorityQueue<>(List.of(3, 1, 2));
// 迭代输出：3, 1, 2（数组顺序）
for (Integer i : pq) System.out.print(i + " ");  // 3 1 2
// 依次 poll 输出：1, 2, 3（堆序）
while (!pq.isEmpty()) System.out.print(pq.poll() + " ");  // 1 2 3
```

迭代器基于 `modCount` 实现 **fail-fast**：迭代过程中队列被结构性修改（增删元素）会抛出 `ConcurrentModificationException`（单线程下是"并发修改"信号，多线程下本来就不该用）。

> **如果想有序遍历**：要么反复 poll，要么 `toArray()` 后 `Arrays.sort()`，要么用 `Stream` 的 `sorted()`。JDK 8 也提供 `spliterator().forEachRemaining()`，同样不是有序的。

## 使用场景与示例

### 1. Top-K（求最大/最小的 K 个元素）

```java
// 求数据流中最大的 3 个数：用小顶堆（堆顶是最小值，超过 K 就淘汰堆顶）
PriorityQueue<Integer> topK = new PriorityQueue<>(3);
for (int num : new int[]{5, 3, 9, 1, 7, 6}) {
    topK.offer(num);
    if (topK.size() > 3) topK.poll();
}
System.out.println(topK);  // [6, 7, 9]（数组顺序，非堆序）
```

### 2. 大顶堆（通过 Comparator 反转）

```java
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Comparator.reverseOrder());
maxHeap.offer(1); maxHeap.offer(5); maxHeap.offer(3);
maxHeap.peek();  // 5
```

### 3. 按对象字段排序

```java
// 按任务截止时间排序（最早截止的最先处理）
PriorityQueue<Task> pq = new PriorityQueue<>(Comparator.comparingLong(Task::getDeadline));
```

### 4. 作为 DelayQueue / 定时任务的底层

`DelayQueue` 的底层正是 `PriorityQueue`：元素按"剩余延迟时间"排序，`take()` 时只有延迟到期（`delay <= 0`）的元素才能从堆顶取出。详见 [DelayQueue 源码分析](/java/collection/delayqueue-source-code.html) 与 [定时任务方案详解](/system-design/schedule-task.html)。

## 常用方法复杂度一览

| 方法                  | 时间复杂度 | 说明                             |
| --------------------- | ---------- | -------------------------------- |
| `offer(e)` / `add(e)` | O(log n)   | 插入元素（siftUp 上浮）          |
| `poll()`              | O(log n)   | 取出并删除堆顶（siftDown 下沉）  |
| `peek()`              | O(1)       | 查看堆顶（不删除）               |
| `remove(o)`           | O(n)       | 先线性查找 O(n)，再堆化 O(log n) |
| `contains(o)`         | O(n)       | 线性遍历                         |
| `size()`              | O(1)       | 元素个数                         |
| 集合构造器建堆        | O(n)       | heapify 从最后一个非叶子节点下沉 |

## 常见面试问题

1. **PriorityQueue 的底层数据结构？**——`Object[]` 数组实现的二叉堆（完全二叉树）。
2. **插入、删除堆顶的时间复杂度？**——都是 O(log n)，peek 是 O(1)。
3. **默认是大顶堆还是小顶堆？怎么实现大顶堆？**——默认小顶堆；传入 `Comparator.reverseOrder()` 或自定义比较器即可。
4. **为什么不允许 null？**——堆化比较时 `compareTo`/`compare` 无法处理 null，会抛 NPE。
5. **建堆的时间复杂度为什么是 O(n)？**——从最后一个非叶子节点从下往上 siftDown，大部分节点深度小，总代价收敛为 O(n)。
6. **siftUp 和 siftDown 分别在什么场景使用？**——插入用 siftUp；删除堆顶、删除任意元素、建堆用 siftDown。
7. **删除任意元素为什么可能 siftUp + siftDown 都执行？**——见上文 remove(Object) 注释。
8. **扩容规则？**——容量 < 64 时 `*2+2`，否则 `*1.5`。
9. **迭代顺序是堆序吗？**——不是，迭代器按底层数组顺序遍历；要有序输出需反复 poll 或排序。
10. **PriorityQueue 线程安全吗？**——不安全，用 `PriorityBlockingQueue`。
11. **如何用 PriorityQueue 求 Top-K？**——维护容量为 K 的小顶堆（求最大 K 个），超过容量淘汰堆顶。

## 相关文章

- [Java 集合常见面试题总结（上）](/java/collection/java-collection-questions-01.html)
- [DelayQueue 源码分析](/java/collection/delayqueue-source-code.html)：PriorityQueue 的直接上层应用
- [Java 必读源码系列](/zhuanlan/source-code-reading.html)
- [定时任务方案详解](/system-design/schedule-task.html)

## 参考

- JDK 源码：`java.util.PriorityQueue`（JDK 17）
- 《Java 编程的逻辑》（马俊昌）
