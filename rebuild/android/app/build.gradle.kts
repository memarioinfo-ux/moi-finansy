plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.kapt")
}

android {
    namespace = "by.moifinansy.rebuild"
    compileSdk = 35

    defaultConfig {
        // Isolated preview package: NEVER overwrite the currently installed finance app.
        applicationId = "by.moifinansy.rebuild"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0-preview"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.room:room-runtime:2.8.5")
    kapt("androidx.room:room-compiler:2.8.5")
    implementation("androidx.webkit:webkit:1.13.0")
}
