// 通用节流工具函数
function throttle(fn, wait = 100) {
	let lastCallTime = 0;
	let timerId = null;

	return function throttled(...args) {
		const now = Date.now();
		const remaining = wait - (now - lastCallTime);

		if (remaining <= 0 || remaining > wait) {
			if (timerId) {
				clearTimeout(timerId);
				timerId = null;
			}
			lastCallTime = now;
			fn.apply(this, args);
		} else if (!timerId) {
			timerId = setTimeout(() => {
				lastCallTime = Date.now();
				timerId = null;
				fn.apply(this, args);
			}, remaining);
		}
	};
}

module.exports = throttle;
