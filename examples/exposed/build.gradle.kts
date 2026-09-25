// The Exposed tables and entities `prisma generate` writes into src/main/kotlin/models, compiled
// with every warning an error beside Check.kt, which runs them against PostgreSQL. `node gradle.ts
// installDist` builds build/install/exposed-example/bin/exposed-example; run.ts starts it with
// -Duser.timezone=UTC and with Asia/Tokyo.
plugins {
    kotlin("jvm") version "2.3.20"
    application
}

repositories {
    mavenCentral()
}

dependencies {
    val exposed = "1.5.0"
    implementation("org.jetbrains.exposed:exposed-core:$exposed")
    implementation("org.jetbrains.exposed:exposed-jdbc:$exposed")
    implementation("org.jetbrains.exposed:exposed-dao:$exposed")
    implementation("org.postgresql:postgresql:42.7.13")
    runtimeOnly("org.slf4j:slf4j-nop:2.0.17")
}

kotlin {
    jvmToolchain(21)
    compilerOptions {
        allWarningsAsErrors.set(true)
    }
}

application {
    mainClass.set("CheckKt")
}
