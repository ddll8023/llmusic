import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getOperationLogs, type OperationLogItem } from '@/api/operationLog'

export const useOperationLogStore = defineStore('operationLog', () => {
	const logs = ref<OperationLogItem[]>([])
	const page = ref(1)
	const pageSize = ref(20)
	const total = ref(0)
	const totalPages = ref(0)
	const loading = ref(false)
	const level = ref<'INFO' | 'WARNING' | 'ERROR' | ''>('')
	const logType = ref<'request' | 'auth' | ''>('')
	const keyword = ref('')

	async function loadLogs() {
		loading.value = true
		try {
			const res = await getOperationLogs({
				page: page.value,
				page_size: pageSize.value,
				level: level.value || undefined,
				log_type: logType.value || undefined,
				keyword: keyword.value.trim() || undefined,
			})
			logs.value = res.data.lists
			total.value = res.data.pagination.total
			totalPages.value = res.data.pagination.total_pages
		} finally {
			loading.value = false
		}
	}

	function setPage(nextPage: number) {
		page.value = nextPage
		return loadLogs()
	}

	function setLevel(nextLevel: 'INFO' | 'WARNING' | 'ERROR' | '') {
		level.value = nextLevel
		page.value = 1
		return loadLogs()
	}

	function setLogType(nextType: 'request' | 'auth' | '') {
		logType.value = nextType
		page.value = 1
		return loadLogs()
	}

	function setKeyword(nextKeyword: string) {
		keyword.value = nextKeyword
		page.value = 1
		return loadLogs()
	}

	return {
		logs,
		page,
		pageSize,
		total,
		totalPages,
		loading,
		level,
		logType,
		keyword,
		loadLogs,
		setPage,
		setLevel,
		setLogType,
		setKeyword,
	}
})
