class Node<K, V> {
	key: K
	value: V
	prev: Node<K, V> | null = null
	next: Node<K, V> | null = null

	constructor(key: K, value: V) {
		this.key = key
		this.value = value
	}
}

/**
 * 简易 LRU 缓存实现（双向链表 + Map）
 * @template K,V
 */
class LRUCache<K, V> {
	private capacity: number
	private map: Map<K, Node<K, V>>
	private head: Node<K, V>
	private tail: Node<K, V>

	constructor(capacity: number = 100) {
		if (capacity <= 0) throw new Error("LRUCache capacity must be > 0")
		this.capacity = capacity
		this.map = new Map()
		// 使用哨兵节点简化边界操作
		this.head = new Node<K, V>(null as unknown as K, null as unknown as V)
		this.tail = new Node<K, V>(null as unknown as K, null as unknown as V)
		this.head.next = this.tail
		this.tail.prev = this.head
	}

	/** 将节点插入头部（标记为最新） */
	private _addNode(node: Node<K, V>): void {
		node.next = this.head.next
		node.prev = this.head
		if (this.head.next) this.head.next.prev = node
		this.head.next = node
	}

	/** 移除链表节点 */
	private _removeNode(node: Node<K, V>): void {
		if (node.prev) node.prev.next = node.next
		if (node.next) node.next.prev = node.prev
	}

	/** 将节点移动到头部 */
	private _moveToHead(node: Node<K, V>): void {
		this._removeNode(node)
		this._addNode(node)
	}

	/** 移除尾部节点并返回 */
	private _popTail(): Node<K, V> | null {
		const node = this.tail.prev
		if (node === this.head) return null
		if (node) this._removeNode(node)
		return node
	}

	/**
	 * 获取缓存值
	 */
	get(key: K): V | undefined {
		const node = this.map.get(key)
		if (!node) return undefined
		this._moveToHead(node)
		return node.value
	}

	/**
	 * 设置缓存值
	 */
	set(key: K, value: V): void {
		let node = this.map.get(key)
		if (node) {
			node.value = value
			this._moveToHead(node)
		} else {
			node = new Node(key, value)
			this.map.set(key, node)
			this._addNode(node)
			if (this.map.size > this.capacity) {
				const tail = this._popTail()
				if (tail) this.map.delete(tail.key)
			}
		}
	}

	/**
	 * 判断是否含有 key
	 */
	has(key: K): boolean {
		return this.map.has(key)
	}

	/** 删除指定键 */
	delete(key: K): boolean {
		const node = this.map.get(key)
		if (!node) return false
		this._removeNode(node)
		this.map.delete(key)
		return true
	}

	/** 清空缓存 */
	clear(): void {
		this.map.clear()
		this.head.next = this.tail
		this.tail.prev = this.head
	}

	/** 缓存大小 */
	get size(): number {
		return this.map.size
	}
}

export default LRUCache
