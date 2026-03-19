package com.tornadotracker.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tornadotracker.data.repository.NwsRepository
import com.tornadotracker.domain.model.NwsProduct
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SearchUiState(
    val results: List<NwsProduct> = emptyList(),
    val isLoading: Boolean = false,
    val selectedType: String = "PNS",
    val office: String = "",
    val keyword: String = ""
)

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val repository: NwsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    fun updateType(type: String) {
        _uiState.value = _uiState.value.copy(selectedType = type)
    }

    fun updateOffice(office: String) {
        _uiState.value = _uiState.value.copy(office = office)
    }

    fun updateKeyword(keyword: String) {
        _uiState.value = _uiState.value.copy(keyword = keyword)
    }

    fun search() {
        viewModelScope.launch {
            val state = _uiState.value
            _uiState.value = state.copy(isLoading = true)

            val office = state.office.ifBlank { null }
            val result = repository.fetchProducts(setOf(state.selectedType), office)

            var products = result.products
            if (state.keyword.isNotBlank()) {
                val kw = state.keyword.lowercase()
                products = products.filter { it.productName.lowercase().contains(kw) }
            }

            _uiState.value = state.copy(results = products, isLoading = false)
        }
    }
}
