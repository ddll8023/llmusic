class Node {
	constructor(key, value) {
		this.key = key;
		this.value = value;
		this.prev = null;
		this.next = null;
	}
}

/**
 * 简易 LRU 缓存实现（双向链表 + Map）
 * @template K,V
 */
class LRUCache {
	/**
	 * @param {number} capacity 最大容量，默认 100
	 */
	constructor(capacity = 100) {
		if (capacity <= 0) throw new Error("LRUCache capacity must be > 0");
		this.capacity = capacity;
		this.map = new Map();
		// 使用哨兵节点简化边界操作
		this.head = new Node(null, null); // 最近使用
		this.tail = new Node(null, null); // 最久未使用
		this.head.next = this.tail;
		this.tail.prev = this.head;
	}

	/** 将节点插入头部（标记为最新） */
	_addNode(node) {
		node.next = this.head.next;
		node.prev = this.head;
		this.head.next.prev = node;
		this.head.next = node;
	}

	/** 移除链表节点 */
	_removeNode(node) {
		node.prev.next = node.next;
		node.next.prev = node.prev;
	}

	/** 将节点移动到头部 */
	_moveToHead(node) {
		this._removeNode(node);
		this._addNode(node);
	}

	/** 移除尾部节点并返回 */
	_popTail() {
		const node = this.tail.prev;
		if (node === this.head) return null;
		this._removeNode(node);
		return node;
	}

	/**
	 * 获取缓存值
	 * @param {K} key
	 * @returns {V|undefined}
	 */
	get(key) {
		const node = this.map.get(key);
		if (!node) return undefined;
		this._moveToHead(node);
		return node.value;
	}

	/**
	 * 设置缓存值
	 * @param {K} key
	 * @param {V} value
	 */
	set(key, value) {
		let node = this.map.get(key);
		if (node) {
			node.value = value;
			this._moveToHead(node);
		} else {
			node = new Node(key, value);
			this.map.set(key, node);
			this._addNode(node);
			if (this.map.size > this.capacity) {
				const tail = this._popTail();
				if (tail) this.map.delete(tail.key);
			}
		}
	}

	/**
	 * 判断是否含有 key
	 * @param {K} key
	 */
	has(key) {
		return this.map.has(key);
	}

	/** 删除指定键 */
	delete(key) {
		const node = this.map.get(key);
		if (!node) return false;
		this._removeNode(node);
		this.map.delete(key);
		return true;
	}

	/** 清空缓存 */
	clear() {
		this.map.clear();
		this.head.next = this.tail;
		this.tail.prev = this.head;
	}

	/** 缓存大小 */
	get size() {
		return this.map.size;
	}
}

module.exports = LRUCache;
