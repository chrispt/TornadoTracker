package com.tornadotracker.data.db

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "notified_products")
data class NotifiedProduct(
    @PrimaryKey val productId: String,
    val notifiedAt: Long = System.currentTimeMillis()
)
