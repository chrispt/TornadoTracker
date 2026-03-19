package com.tornadotracker.ui.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.drawable.BitmapDrawable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.tornadotracker.domain.model.TornadoMarker
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon

@Composable
fun MapScreen(
    markers: List<TornadoMarker>,
    onMarkerClick: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current

    val mapView = remember {
        MapView(context).apply {
            setTileSource(TileSourceFactory.MAPNIK)
            setMultiTouchControls(true)
            controller.setZoom(4.0)
            controller.setCenter(GeoPoint(39.0, -95.0))
        }
    }

    DisposableEffect(Unit) {
        mapView.onResume()
        onDispose {
            mapView.onPause()
            mapView.onDetach()
        }
    }

    AndroidView(
        factory = { mapView },
        modifier = modifier.fillMaxSize(),
        update = { map ->
            map.overlays.clear()

            val geoPoints = mutableListOf<GeoPoint>()

            markers.forEach { marker ->
                val point = GeoPoint(marker.lat, marker.lon)
                geoPoints.add(point)

                // Draw TOR polygon if present
                if (marker.polygon != null && marker.polygon.isNotEmpty()) {
                    val polygon = Polygon().apply {
                        val polyPoints = marker.polygon.map { GeoPoint(it.lat, it.lon) }
                        points = polyPoints + polyPoints.first()
                        fillPaint.color = 0x26A855F7.toInt() // purple 15%
                        outlinePaint.color = 0xFFA855F7.toInt()
                        outlinePaint.strokeWidth = 2f
                    }
                    map.overlays.add(polygon)
                }

                // Create marker
                val mapMarker = Marker(map).apply {
                    position = point
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    title = marker.efRating ?: marker.type
                    snippet = buildString {
                        marker.county?.let { append("$it · ") }
                        marker.pathLength?.let { append(it) }
                    }
                    icon = createMarkerIcon(marker)
                    setOnMarkerClickListener { _, _ ->
                        onMarkerClick(marker.productId)
                        true
                    }
                }
                map.overlays.add(mapMarker)
            }

            // Auto-fit bounds
            if (geoPoints.size > 1) {
                try {
                    val box = BoundingBox.fromGeoPoints(geoPoints)
                    map.zoomToBoundingBox(box.increaseByScale(1.3f), true)
                } catch (_: Exception) { }
            } else if (geoPoints.size == 1) {
                map.controller.animateTo(geoPoints[0], 8.0, null)
            }

            map.invalidate()
        }
    )
}

private fun createMarkerIcon(marker: TornadoMarker): BitmapDrawable {
    val size = 32
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    // Circle color based on EF rating or type
    paint.color = when (marker.efRating) {
        "EF0" -> 0xFFFDE047.toInt()
        "EF1" -> 0xFFFACC15.toInt()
        "EF2" -> 0xFFF97316.toInt()
        "EF3" -> 0xFFEF4444.toInt()
        "EF4" -> 0xFFDC2626.toInt()
        "EF5" -> 0xFF991B1B.toInt()
        else -> when (marker.type) {
            "TOR" -> 0xFFA855F7.toInt()
            "PNS" -> 0xFF3B82F6.toInt()
            "LSR" -> 0xFF8B5CF6.toInt()
            else -> 0xFF6B7280.toInt()
        }
    }

    canvas.drawCircle(size / 2f, size / 2f, size / 2f - 2f, paint)

    // Draw EF number or type initial
    paint.color = 0xFFFFFFFF.toInt()
    paint.textSize = 14f
    paint.textAlign = Paint.Align.CENTER
    val text = marker.efRating?.removePrefix("EF") ?: marker.type.first().toString()
    val textY = size / 2f - (paint.descent() + paint.ascent()) / 2f
    canvas.drawText(text, size / 2f, textY, paint)

    return BitmapDrawable(null, bitmap)
}
