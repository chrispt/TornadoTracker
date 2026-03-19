package com.tornadotracker.ui.map

import androidx.lifecycle.ViewModel
import com.tornadotracker.domain.model.TornadoMarker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

@HiltViewModel
class MapViewModel @Inject constructor() : ViewModel() {

    private val _markers = MutableStateFlow<List<TornadoMarker>>(emptyList())
    val markers: StateFlow<List<TornadoMarker>> = _markers.asStateFlow()

    fun updateMarkers(markers: List<TornadoMarker>) {
        _markers.value = markers
    }
}
