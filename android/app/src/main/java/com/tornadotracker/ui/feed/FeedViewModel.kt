package com.tornadotracker.ui.feed

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tornadotracker.data.preferences.UserPreferences
import com.tornadotracker.data.repository.NwsRepository
import com.tornadotracker.domain.model.NwsProduct
import com.tornadotracker.domain.model.TornadoMarker
import dagger.hilt.android.lifecycle.HiltViewModel
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
    val markers: List<TornadoMarker> = emptyList(),
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

    init {
        refresh()
        startPolling()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val categories = selectedCategories.value
            val result = repository.fetchProducts(categories)
            _uiState.value = FeedUiState(
                products = result.products,
                markers = result.markers,
                isLoading = false,
                error = result.errors.firstOrNull()
            )
        }
    }

    fun toggleCategory(key: String) {
        viewModelScope.launch {
            val current = selectedCategories.value.toMutableSet()
            if (key in current) current.remove(key) else current.add(key)
            preferences.setSelectedCategories(current)
            refresh()
        }
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
