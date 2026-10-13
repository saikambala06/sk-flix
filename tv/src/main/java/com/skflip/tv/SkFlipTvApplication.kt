package com.skflip.tv

import android.app.Application
import com.skflip.core.network.ServiceLocator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SkFlipTvApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ServiceLocator.init(this)
        CoroutineScope(Dispatchers.IO).launch {
            ServiceLocator.sessionManager.restore()
        }
    }
}
