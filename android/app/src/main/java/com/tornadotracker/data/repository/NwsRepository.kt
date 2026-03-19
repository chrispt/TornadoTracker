package com.tornadotracker.data.repository

import com.tornadotracker.data.api.NwsApiService
import com.tornadotracker.data.api.ProductDetailResponse
import com.tornadotracker.data.api.ProductSummary
import com.tornadotracker.data.cache.ProductCache
import com.tornadotracker.domain.model.NwsProduct
import com.tornadotracker.domain.model.ParseResult
import com.tornadotracker.domain.model.TornadoMarker
import com.tornadotracker.domain.parser.NwsTextParser
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
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
    }

    data class FetchResult(
        val products: List<NwsProduct>,
        val markers: List<TornadoMarker>,
        val errors: List<String>
    )

    suspend fun fetchProducts(types: Set<String>, office: String? = null): FetchResult = coroutineScope {
        val errors = mutableListOf<String>()
        val allSummaries = mutableListOf<ProductSummary>()

        // Fetch product lists in parallel
        val fetches = types.map { type ->
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

        // Sort by issuance time descending
        allSummaries.sortByDescending { it.issuanceTime }

        // Filter to tornado-relevant and build markers
        val filteredProducts = mutableListOf<NwsProduct>()
        val markers = mutableListOf<TornadoMarker>()

        val filterJobs = allSummaries.map { summary ->
            async {
                try {
                    val code = summary.productCode ?: return@async null

                    if (code in ALWAYS_TORNADO_TYPES) {
                        val (detail, parsed) = fetchAndParse(summary)
                        val product = summary.toDomain(parsed?.subType, parsed?.isPDS ?: false)
                        val productMarkers = collectMarkers(summary, parsed)
                        Triple(product, productMarkers, true)
                    } else if (code in NEEDS_CONTENT_CHECK) {
                        val (detail, parsed) = fetchAndParse(summary)
                        if (parsed?.hasTornadoContent == true) {
                            val product = summary.toDomain(parsed.subType, parsed.isPDS)
                            val productMarkers = collectMarkers(summary, parsed)
                            Triple(product, productMarkers, true)
                        } else {
                            null
                        }
                    } else {
                        val product = summary.toDomain(null, false)
                        Triple(product, emptyList<TornadoMarker>(), true)
                    }
                } catch (e: Exception) {
                    null
                }
            }
        }

        filterJobs.awaitAll().filterNotNull().forEach { (product, productMarkers, _) ->
            filteredProducts.add(product)
            markers.addAll(productMarkers)
        }

        // Re-sort
        filteredProducts.sortByDescending { it.issuanceTime }

        FetchResult(filteredProducts, markers, errors)
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

    private fun collectMarkers(summary: ProductSummary, parsed: ParseResult?): List<TornadoMarker> {
        if (parsed?.tornadoes == null) return emptyList()
        return parsed.tornadoes.filter { it.lat != null && it.lon != null }.map { t ->
            TornadoMarker(
                lat = t.lat!!,
                lon = t.lon!!,
                efRating = t.efRating,
                productId = summary.id,
                label = summary.productName ?: "",
                county = t.county,
                pathLength = t.pathLength,
                type = summary.productCode ?: "",
                polygon = t.polygon
            )
        }
    }

    private fun ProductSummary.toDomain(subType: String?, isPDS: Boolean): NwsProduct {
        return NwsProduct(
            id = id,
            productCode = productCode ?: "",
            productName = productName ?: "",
            issuingOffice = issuingOffice ?: "",
            issuanceTime = issuanceTime ?: "",
            subType = subType,
            isPDS = isPDS
        )
    }
}
