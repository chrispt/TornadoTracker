package com.tornadotracker.data.db

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [NotifiedProduct::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun notifiedProductDao(): NotifiedProductDao
}
