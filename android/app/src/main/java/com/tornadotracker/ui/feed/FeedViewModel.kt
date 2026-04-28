package com.tornadotracker.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tornadotracker.data.preferences.UserPreferences
import com.tornadotracker.data.repository.NwsRepository
import com.tornadotracker.domain.model.NwsProduct
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

data class FeedUiState(
    val products: List<NwsProduct> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class FeedViewModel @Inject constructor(
    private val repository: NwsRepository,
    private val preferences: UserPreferences
) : ViewModel() {

    private val _uiState = MutableStateFlow(FeedUiState())
    val uiState: StateFlow<FeedUiState> = _uiState.asStateFlow()

    val selectedCategories: StateFlow<Set<String>> = preferences.selectedCategories
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), UserPreferences.ALL_CATEGORIES)

    /** All tornado products (unfiltered) for re-filtering on category change */
    private val allTornadoProducts = mutableListOf<NwsProduct>()
    private var backgroundJob: Job? = null

    init {
        refresh()
        startPolling()
        startAlertsPolling()
    }

    fun refresh() {
        backgroundJob?.cancel()
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val result = repository.fetchProductsImmediate()

            // Stage 1: Show TOR products immediately. Keep alert-derived
            // entries (warnings/watches/emergencies) since those are
            // refreshed on a separate cadence.
            allTornadoProducts.removeAll { it.category?.key !in ALERT_CATEGORIES }
            allTornadoProducts.addAll(result.torProducts)
            allTornadoProducts.sortByDescending { it.issuanceTime }
            applyFilterAndUpdateState(error = result.errors.firstOrNull())
            _uiState.value = _uiState.value.copy(isLoading = false)

            // Stage 2: Background fetch PNS/LSR details + back-fill TOR
            backgroundJob = launch {
                repository.fetchProductsBackground(result.allSummaries).collect { product ->
                    val existing = allTornadoProducts.indexOfFirst { it.id == product.id }
                    if (existing >= 0) {
                        allTornadoProducts[existing] = product
                    } else {
                        allTornadoProducts.add(product)
                    }
                    allTornadoProducts.sortByDescending { it.issuanceTime }
                    applyFilterAndUpdateState()
                }
            }
        }
    }

    /** Refresh active alerts (warnings + watches + emergencies). */
    private fun refreshAlerts() {
        viewModelScope.launch {
            val alerts = repository.fetchActiveAlerts()
            allTornadoProducts.removeAll { it.category?.key in ALERT_CATEGORIES }
            allTornadoProducts.addAll(alerts)
            allTornadoProducts.sortByDescending { it.issuanceTime }
            applyFilterAndUpdateState()
        }
    }

    companion object {
        private val ALERT_CATEGORIES = setOf("ALERT", "WATCH", "EMERGENCY")
    }

    private fun startAlertsPolling() {
        viewModelScope.launch {
            refreshAlerts()
            while (true) {
                delay(30_000) // 30s — alerts cadence
                refreshAlerts()
            }
        }
    }

    fun toggleCategory(key: String) {
        viewModelScope.launch {
            val current = selectedCategories.value.toMutableSet()
            if (key in current) current.remove(key) else current.add(key)
            preferences.setSelectedCategories(current)
            // Re-filter from cached products instead of re-fetching
            applyFilterAndUpdateState()
        }
    }

    private fun applyFilterAndUpdateState(error: String? = _uiState.value.error) {
        val categories = selectedCategories.value
        val filtered = allTornadoProducts.filter { p ->
            p.category != null && p.category.key in categories
        }
        _uiState.value = _uiState.value.copy(products = filtered, error = error)
    }

    private fun startPolling() {
        viewModelScope.launch {
            while (true) {
                delay(120_000) // 2 minutes
                refresh()
            }
        }
    }
}
