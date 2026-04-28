package com.tornadotracker.data.api

import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface NwsApiService {

    @GET("products")
    suspend fun getProducts(
        @Query("type") type: String,
        @Query("limit") limit: Int = 250,
        @Query("office") office: String? = null
    ): ProductListResponse

    @GET("products/{id}")
    suspend fun getProduct(
        @Path("id") id: String
    ): ProductDetailResponse

    /**
     * Fetch currently-active tornado warnings as GeoJSON. Mirrors the web app's
     * fetchActiveAlerts() — used to surface live warnings before the PNS/TOR
     * polling loop catches up.
     */
    @GET("alerts/active")
    suspend fun getActiveAlerts(
        @Query("event") event: String = "Tornado Warning"
    ): ActiveAlertsResponse
}
