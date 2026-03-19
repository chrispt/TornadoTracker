package com.tornadotracker.ui.map

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.drawable.BitmapDrawable
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import com.tornadotracker.domain.model.Category
import com.tornadotracker.domain.model.MarkerShape
import com.tornadotracker.domain.model.TornadoMarker
import org.osmdroid.tileprovider.tilesource.TileSourceFactory
import org.osmdroid.util.BoundingBox
import org.osmdroid.util.GeoPoint
import org.osmdroid.views.MapView
import android.graphics.DashPathEffect
import org.osmdroid.views.overlay.Marker
import org.osmdroid.views.overlay.Polygon
import org.osmdroid.views.overlay.Polyline

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
                        val catColor = marker.category?.let { categoryColor(it) } ?: 0xFFA855F7.toInt()
                        fillPaint.color = (catColor and 0x00FFFFFF) or 0x26000000
                        outlinePaint.color = catColor
                        outlinePaint.strokeWidth = 2f
                    }
                    map.overlays.add(polygon)
                }

                // Draw damage survey path line
                if (marker.pathLine != null && marker.pathLine.size == 2) {
                    val polyline = Polyline().apply {
                        val linePoints = marker.pathLine.map { GeoPoint(it.lat, it.lon) }
                        setPoints(linePoints)
                        val catColor = marker.category?.let { categoryColor(it) } ?: 0xFF6B7280.toInt()
                        outlinePaint.color = catColor
                        outlinePaint.strokeWidth = 4f
                        outlinePaint.pathEffect = DashPathEffect(floatArrayOf(16f, 8f), 0f)
                    }
                    map.overlays.add(polyline)
                    geoPoints.add(GeoPoint(marker.pathLine[1].lat, marker.pathLine[1].lon))
                }

                // Create marker
                val mapMarker = Marker(map).apply {
                    position = point
                    setAnchor(Marker.ANCHOR_CENTER, Marker.ANCHOR_CENTER)
                    title = marker.efRating ?: marker.category?.label ?: marker.type
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

private fun categoryColor(cat: Category): Int = when (cat) {
    Category.SURVEY  -> 0xFF3B82F6.toInt()
    Category.LSR     -> 0xFF8B5CF6.toInt()
    Category.PDS     -> 0xFFEF4444.toInt()
    Category.WARNING -> 0xFFA855F7.toInt()
}

private fun markerColor(marker: TornadoMarker): Int {
    // Color by category type
    return marker.category?.let { categoryColor(it) } ?: 0xFF6B7280.toInt()
}

private fun createMarkerIcon(marker: TornadoMarker): BitmapDrawable {
    val size = 32
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    paint.color = markerColor(marker)
    val shape = marker.category?.shape ?: MarkerShape.CIRCLE

    when (shape) {
        MarkerShape.CIRCLE -> {
            canvas.drawCircle(size / 2f, size / 2f, size / 2f - 2f, paint)
        }
        MarkerShape.DIAMOND -> {
            val path = Path()
            val cx = size / 2f
            val cy = size / 2f
            val r = size / 2f - 2f
            path.moveTo(cx, cy - r)      // top
            path.lineTo(cx + r, cy)       // right
            path.lineTo(cx, cy + r)       // bottom
            path.lineTo(cx - r, cy)       // left
            path.close()
            canvas.drawPath(path, paint)
        }
        MarkerShape.SQUARE -> {
            val inset = 3f
            canvas.drawRoundRect(inset, inset, size - inset, size - inset, 4f, 4f, paint)
        }
        MarkerShape.TRIANGLE -> {
            val path = Path()
            val inset = 2f
            path.moveTo(size / 2f, inset)                    // top center
            path.lineTo(size - inset, size - inset)           // bottom right
            path.lineTo(inset, size - inset)                  // bottom left
            path.close()
            canvas.drawPath(path, paint)
        }
    }

    // Draw category letter
    paint.color = 0xFFFFFFFF.toInt()
    paint.textSize = 14f
    paint.textAlign = Paint.Align.CENTER
    val text = marker.category?.letter?.toString() ?: "?"
    val textY = size / 2f - (paint.descent() + paint.ascent()) / 2f
    canvas.drawText(text, size / 2f, textY, paint)

    return BitmapDrawable(null, bitmap)
}
