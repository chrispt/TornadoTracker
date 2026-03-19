package com.tornadotracker.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface NotifiedProductDao {

    @Query("SELECT EXISTS(SELECT 1 FROM notified_products WHERE productId = :id)")
    suspend fun exists(id: String): Boolean

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(product: NotifiedProduct)

    @Query("DELETE FROM notified_products WHERE notifiedAt < :cutoff")
    suspend fun deleteOlderThan(cutoff: Long)
}
