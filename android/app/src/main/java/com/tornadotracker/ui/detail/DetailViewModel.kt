package com.tornadotracker.ui.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.tornadotracker.data.api.ProductDetailResponse
import com.tornadotracker.data.repository.NwsRepository
import com.tornadotracker.domain.model.ParseResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class DetailUiState(
    val detail: ProductDetailResponse? = null,
    val parsed: ParseResult? = null,
    val isLoading: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class DetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val repository: NwsRepository
) : ViewModel() {

    private val productId: String = savedStateHandle["productId"] ?: ""

    private val _uiState = MutableStateFlow(DetailUiState())
    val uiState: StateFlow<DetailUiState> = _uiState.asStateFlow()

    init {
        loadDetail()
    }

    private fun loadDetail() {
        if (productId.isBlank()) return
        viewModelScope.launch {
            _uiState.value = DetailUiState(isLoading = true)
            val (detail, parsed) = repository.fetchProductDetail(productId)
            _uiState.value = DetailUiState(
                detail = detail,
                parsed = parsed,
                isLoading = false,
                error = if (detail == null) "Failed to load product" else null
            )
        }
    }
}
