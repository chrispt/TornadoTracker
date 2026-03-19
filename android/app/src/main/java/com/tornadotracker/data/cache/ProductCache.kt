package com.tornadotracker.data.cache

import com.tornadotracker.data.api.ProductDetailResponse
import com.tornadotracker.domain.model.ParseResult
import javax.inject.Inject
import javax.inject.Singleton

data class CacheEntry(
    val detail: ProductDetailResponse,
    val parsedData: ParseResult?,
    val fetchedAt: Long = System.currentTimeMillis()
)

@Singleton
class ProductCache @Inject constructor() {

    private val cache = LinkedHashMap<String, CacheEntry>(100, 0.75f, true)

    companion object {
        private const val TTL_MS = 30 * 60 * 1000L // 30 minutes
        private const val MAX_ENTRIES = 100
    }

    @Synchronized
    fun get(id: String): CacheEntry? {
        val entry = cache[id] ?: return null
        if (System.currentTimeMillis() - entry.fetchedAt > TTL_MS) {
            cache.remove(id)
            return null
        }
        return entry
    }

    @Synchronized
    fun set(id: String, detail: ProductDetailResponse, parsedData: ParseResult? = null) {
        if (cache.size >= MAX_ENTRIES && !cache.containsKey(id)) {
            val oldestKey = cache.keys.first()
            cache.remove(oldestKey)
        }
        cache[id] = CacheEntry(detail, parsedData)
    }

    @Synchronized
    fun clear() {
        cache.clear()
    }
}
