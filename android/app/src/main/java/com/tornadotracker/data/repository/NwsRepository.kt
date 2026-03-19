package com.tornadotracker.data.repository

import com.tornadotracker.data.api.NwsApiService
import com.tornadotracker.data.api.ProductDetailResponse
import com.tornadotracker.data.api.ProductSummary
import com.tornadotracker.data.cache.ProductCache
import com.tornadotracker.domain.model.Category
import com.tornadotracker.domain.model.NwsProduct
import com.tornadotracker.domain.model.ParseResult
import com.tornadotracker.domain.model.TornadoMarker
import com.tornadotracker.domain.parser.NwsTextParser
import com.tornadotracker.domain.model.LatLon
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NwsRepository @Inject constructor(
    private val api: NwsApiService,
    private val parser: NwsTextParser,
    private val cache: ProductCache
) {
    companion object {
        private val ALWAYS_TORNADO_TYPES = setOf("TOR")
        private val NEEDS_CONTENT_CHECK = setOf("PNS", "LSR")
        /** Always fetch all NWS types regardless of category filter */
        private val ALL_NWS_TYPES = setOf("PNS", "TOR", "LSR")
    }

    data class FetchResult(
        val products: List<NwsProduct>,
        val errors: List<String>
    )

    /**
     * Stage 1: Fetch product lists and return TOR products immediately.
     * TOR products get a default WARNING category (upgraded to PDS in background).
     * Also returns the summaries that need detail checks (PNS/LSR) + TOR for back-fill.
     */
    data class ImmediateResult(
        val torProducts: List<NwsProduct>,
        val allSummaries: List<ProductSummary>,
        val errors: List<String>
    )

    suspend fun fetchProductsImmediate(
        office: String? = null
    ): ImmediateResult = coroutineScope {
        val errors = mutableListOf<String>()
        val allSummaries = mutableListOf<ProductSummary>()

        val fetches = ALL_NWS_TYPES.map { type ->
            async {
                try {
                    val response = api.getProducts(type, 50, office)
                    response.graph
                } catch (e: Exception) {
                    errors.add("$type: ${e.message}")
                    emptyList()
                }
            }
        }

        fetches.awaitAll().forEach { allSummaries.addAll(it) }
        allSummaries.sortByDescending { it.issuanceTime }

        // TOR products go into the feed immediately with default category
        val torProducts = allSummaries
            .filter { it.productCode in ALWAYS_TORNADO_TYPES }
            .map { summary ->
                val code = summary.productCode ?: "TOR"
                summary.toDomain(code, isPDS = false, Category.fromSubType(code))
            }

        ImmediateResult(torProducts, allSummaries, errors)
    }

    /**
     * Stage 2: Process summaries in background batches, emitting confirmed tornado products.
     * Back-fills TOR details (upgrades to PDS if applicable) and checks PNS/LSR for tornado content.
     */
    fun fetchProductsBackground(
        summaries: List<ProductSummary>
    ): Flow<NwsProduct> = flow {
        val batchSize = 10
        for (i in summaries.indices step batchSize) {
            val batch = summaries.subList(i, minOf(i + batchSize, summaries.size))
            // Process batch in parallel, collect results, then emit
            val batchResults = coroutineScope {
                batch.map { summary ->
                    async {
                        try {
                            val code = summary.productCode ?: return@async null
                            val (_, parsed) = fetchAndParse(summary)

                            if (code in ALWAYS_TORNADO_TYPES) {
                                val category = Category.fromSubType(parsed?.subType ?: code)
                                summary.toDomain(parsed?.subType, parsed?.isPDS ?: false, category)
                            } else if (code in NEEDS_CONTENT_CHECK && parsed?.hasTornadoContent == true) {
                                val category = Category.fromSubType(parsed.subType ?: code)
                                summary.toDomain(parsed.subType, parsed.isPDS, category)
                            } else {
                                null
                            }
                        } catch (e: Exception) {
                            null
                        }
                    }
                }.awaitAll().filterNotNull()
            }
            batchResults.forEach { product -> emit(product) }
        }
    }

    /**
     * Build markers for a single product from cache.
     */
    fun getProductMarkers(id: String): List<TornadoMarker> {
        val cached = cache.get(id) ?: return emptyList()
        val parsed = cached.parsedData ?: return emptyList()
        if (parsed.tornadoes == null) return emptyList()

        val category = Category.fromSubType(parsed.subType ?: "")
        return parsed.tornadoes.filter { it.lat != null && it.lon != null }.map { t ->
            TornadoMarker(
                lat = t.lat!!,
                lon = t.lon!!,
                efRating = t.efRating,
                productId = id,
                label = "",
                county = t.county,
                pathLength = t.pathLength,
                type = "",
                category = category,
                polygon = t.polygon,
                pathLine = if (t.startLat != null && t.endLat != null) {
                    listOf(LatLon(t.startLat, t.startLon!!), LatLon(t.endLat, t.endLon!!))
                } else null
            )
        }
    }

    suspend fun fetchProductDetail(id: String): Pair<ProductDetailResponse?, ParseResult?> {
        val cached = cache.get(id)
        if (cached != null) return Pair(cached.detail, cached.parsedData)

        return try {
            val detail = api.getProduct(id)
            val parsed = parser.parseProductText(detail.productText, detail.productCode ?: "PNS")
            cache.set(id, detail, parsed)
            Pair(detail, parsed)
        } catch (e: Exception) {
            Pair(null, null)
        }
    }

    private suspend fun fetchAndParse(summary: ProductSummary): Pair<ProductDetailResponse?, ParseResult?> {
        return fetchProductDetail(summary.id)
    }

    private fun ProductSummary.toDomain(subType: String?, isPDS: Boolean, category: Category?): NwsProduct {
        return NwsProduct(
            id = id,
            productCode = productCode ?: "",
            productName = productName ?: "",
            issuingOffice = issuingOffice ?: "",
            issuanceTime = issuanceTime ?: "",
            subType = subType,
            isPDS = isPDS,
            category = category
        )
    }
}
