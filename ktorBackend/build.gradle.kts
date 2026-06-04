plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.serialization") version "2.0.21"
    id("io.ktor.plugin") version "3.0.1"
}

group = "com.omninom"
version = "1.0.0"

repositories {
    mavenCentral()
}

dependencies {
    // Ktor Server Core & Netty Engine
    implementation("io.ktor:ktor-server-core-jvm:3.0.1")
    implementation("io.ktor:ktor-server-netty-jvm:3.0.1")

    // Ktor Server Plugins
    implementation("io.ktor:ktor-server-auth-jvm:3.0.1")
    implementation("io.ktor:ktor-server-auth-jwt-jvm:3.0.1")
    implementation("io.ktor:ktor-server-websockets-jvm:3.0.1")
    implementation("io.ktor:ktor-server-content-negotiation-jvm:3.0.1")
    implementation("io.ktor:ktor-server-cors-jvm:3.0.1")
    implementation("io.ktor:ktor-server-call-logging-jvm:3.0.1")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:3.0.1")

    // Database & Connection Pooling
    implementation("org.jetbrains.exposed:exposed-core:0.55.0")
    implementation("org.jetbrains.exposed:exposed-dao:0.55.0")
    implementation("org.jetbrains.exposed:exposed-jdbc:0.55.0")
    implementation("org.jetbrains.exposed:exposed-json:0.55.0")
    implementation("org.jetbrains.exposed:exposed-java-time:0.55.0")
    implementation("org.postgresql:postgresql:42.7.4")
    implementation("com.zaxxer:HikariCP:5.1.0")

    // Ktor Client (for scraping/OpenRouter AI calls)
    implementation("io.ktor:ktor-client-core-jvm:3.0.1")
    implementation("io.ktor:ktor-client-cio-jvm:3.0.1")
    implementation("io.ktor:ktor-client-content-negotiation-jvm:3.0.1")
    implementation("io.ktor:ktor-client-logging-jvm:3.0.1")
    implementation("io.ktor:ktor-serialization-kotlinx-json-jvm:3.0.1")

    // Utilities
    implementation("org.jsoup:jsoup:1.18.1")
    
    // Logging
    implementation("ch.qos.logback:logback-classic:1.5.12")

    // Testing
    testImplementation("io.ktor:ktor-server-tests-jvm:3.0.1")
    testImplementation("org.jetbrains.kotlin:kotlin-test-junit:2.0.21")
}

kotlin {
    jvmToolchain(21)
}

application {
    mainClass.set("com.omninom.ApplicationKt")
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile>().configureEach {
    kotlinOptions.freeCompilerArgs += "-opt-in=kotlin.RequiresOptIn"
}
