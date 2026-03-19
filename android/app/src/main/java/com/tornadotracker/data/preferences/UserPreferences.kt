package com.tornadotracker.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "tornado_prefs")

@Singleton
class UserPreferences @Inject constructor(
    private val dataStore: DataStore<Preferences>
) {
    companion object {
        private val SELECTED_CATEGORIES = stringSetPreferencesKey("selected_categories")
        private val NOTIFICATIONS_ENABLED = booleanPreferencesKey("notifications_enabled")

        // Old key for migration
        private val SELECTED_TYPES_OLD = stringSetPreferencesKey("selected_types")

        val ALL_CATEGORIES = setOf("SURVEY", "LSR", "PDS", "WARNING")
    }

    val selectedCategories: Flow<Set<String>> = dataStore.data.map { prefs ->
        // Migrate old key if present
        if (prefs[SELECTED_CATEGORIES] == null && prefs[SELECTED_TYPES_OLD] != null) {
            ALL_CATEGORIES // Return defaults; actual migration happens on first write
        } else {
            prefs[SELECTED_CATEGORIES] ?: ALL_CATEGORIES
        }
    }

    val notificationsEnabled: Flow<Boolean> = dataStore.data.map { prefs ->
        prefs[NOTIFICATIONS_ENABLED] ?: true
    }

    suspend fun setSelectedCategories(categories: Set<String>) {
        dataStore.edit { prefs ->
            prefs[SELECTED_CATEGORIES] = categories
            // Clean up old key if present
            prefs.remove(SELECTED_TYPES_OLD)
        }
    }

    suspend fun setNotificationsEnabled(enabled: Boolean) {
        dataStore.edit { prefs ->
            prefs[NOTIFICATIONS_ENABLED] = enabled
        }
    }
}
