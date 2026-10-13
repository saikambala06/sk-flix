package com.skflip.mobile

import android.app.Application
import com.skflip.core.network.ServiceLocator
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class SkFlipApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        ServiceLocator.init(this)
        CoroutineScope(Dispatchers.IO).launch {
            ServiceLocator.sessionManager.restore()
        }
    }
}
