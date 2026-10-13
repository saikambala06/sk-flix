package com.skflip.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.skflip.mobile.navigation.SkFlipNavGraph
import com.skflip.mobile.ui.theme.SkFlipTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            SkFlipTheme {
                SkFlipNavGraph()
            }
        }
    }
}
