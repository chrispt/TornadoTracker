package com.tornadotracker.data.api

import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

interface NwsApiService {

    @GET("products")
    suspend fun getProducts(
        @Query("type") type: String,
        @Query("limit") limit: Int = 50,
        @Query("office") office: String? = null
    ): ProductListResponse

    @GET("products/{id}")
    suspend fun getProduct(
        @Path("id") id: String
    ): ProductDetailResponse
}
