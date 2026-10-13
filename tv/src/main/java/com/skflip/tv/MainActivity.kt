package com.skflip.tv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.skflip.tv.navigation.SkFlipTvNavGraph
import com.skflip.tv.ui.theme.SkFlipTvTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            SkFlipTvTheme {
                SkFlipTvNavGraph()
            }
        }
    }
}
