package com.tornadotracker.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.tornadotracker.ui.detail.DetailScreen
import com.tornadotracker.ui.feed.FeedScreen
import com.tornadotracker.ui.search.SearchScreen
import kotlinx.serialization.Serializable

@Serializable object FeedRoute
@Serializable object SearchRoute
@Serializable data class DetailRoute(val productId: String)

data class BottomNavItem(
    val label: String,
    val icon: ImageVector,
    val route: Any
)

@Composable
fun AppNavigation() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()

    val bottomItems = listOf(
        BottomNavItem("Feed", Icons.AutoMirrored.Filled.List, FeedRoute),
        BottomNavItem("Search", Icons.Default.Search, SearchRoute)
    )

    // Hide bottom bar on detail screen
    val currentRoute = navBackStackEntry?.destination
    val showBottomBar = currentRoute?.hasRoute<DetailRoute>() != true

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            if (showBottomBar) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    bottomItems.forEach { item ->
                        val selected = when (item.route) {
                            is FeedRoute -> currentRoute?.hasRoute<FeedRoute>() == true
                            is SearchRoute -> currentRoute?.hasRoute<SearchRoute>() == true
                            else -> false
                        }
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(item.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(item.icon, contentDescription = item.label) },
                            label = { Text(item.label) }
                        )
                    }
                }
            }
        }
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = FeedRoute,
            modifier = Modifier.padding(padding)
        ) {
            composable<FeedRoute> {
                FeedScreen(
                    onProductClick = { id -> navController.navigate(DetailRoute(id)) },
                    viewModel = feedViewModel
                )
            }
            composable<SearchRoute> {
                SearchScreen(
                    onProductClick = { id -> navController.navigate(DetailRoute(id)) }
                )
            }
            composable<DetailRoute> {
                DetailScreen(onBack = { navController.popBackStack() })
            }
        }
    }
}
