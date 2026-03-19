package com.tornadotracker.di

import com.tornadotracker.worker.TornadoCheckWorker
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
object WorkerModule
