import com.varabyte.kobweb.gradle.application.util.configAsKobwebApplication
import kotlinx.html.link
import kotlinx.html.meta
import kotlinx.html.script
import kotlinx.html.unsafe

plugins {
    alias(libs.plugins.kotlin.multiplatform)
    alias(libs.plugins.jetbrains.compose)
    alias(libs.plugins.kobweb.application)
    alias(libs.plugins.kobwebx.markdown)
}

group = "com.binayshaw7777.kotfolio"
version = "1.0-SNAPSHOT"

kobweb {
    app {
        index {
            description.set("Perform portfolio developed using Kobweb, a Kotlin CMP Framework")
            head.add {
                link(rel = "preconnect", href = "https://fonts.googleapis.com")
                link(
                    rel = "preconnect",
                    href = "https://fonts.gstatic.com"
                ) { attributes["crossorigin"] = "" }
                link(
                    href = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100;0,9..40,200;0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800;0,9..40,900;0,9..40,1000;1,9..40,100;1,9..40,200;1,9..40,300;1,9..40,400;1,9..40,500;1,9..40,600;1,9..40,700;1,9..40,800;1,9..40,900;1,9..40,1000&family=Space+Grotesk:wght@300;400;500;600;700&family=Tauri&display=swap",
                    rel = "stylesheet"
                )
                meta(name = "google-adsense-account", content = "ca-pub-2255472474228401")
                script {
                    unsafe {
                        +"""
                        var __covfolioIsExporting = false;
                        try {
                            if (window.location) {
                                if (window.location.search) {
                                    __covfolioIsExporting = new URLSearchParams(window.location.search).get("_kobwebIsExporting") === "true";
                                }
                            }
                        } catch (e) {}
                        window.__adsenseBlocked = window.__adsenseBlocked === true ? true : false;
                        window.__adsenseLoaded = window.__adsenseLoaded === true ? true : false;
                        window.adsbygoogle = window.adsbygoogle || [];
                        window.adBreak = window.adBreak || function(o) { if (!__covfolioIsExporting) { window.adsbygoogle.push(o); } };
                        window.adConfig = window.adConfig || function(o) { if (!__covfolioIsExporting) { window.adsbygoogle.push(o); } };
                        """.trimIndent()
                    }
                }
                script(src = "/jellydrift/adsense.js") {}
                script(
                    src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2255472474228401"
                ) {
                    async = true
                    attributes["crossorigin"] = "anonymous"
                    attributes["data-ad-frequency-hint"] = "30s"
                    attributes["onerror"] = "window.__adsenseBlocked = true;"
                    attributes["onload"] = "window.__adsenseLoaded = true;"
                }
            }
        }
    }
}

tasks.matching { it.name == "kobwebExport" }.configureEach {
    doLast {
        val exportDir = layout.projectDirectory.dir(".kobweb/site").asFile
        if (exportDir.exists()) {
            val showAdsScriptRegex = Regex(
                """\s*<script[^>]+(?:show_ads_impl|pagead/managed/js/adsense)[^>]*>\s*</script>""",
                RegexOption.IGNORE_CASE
            )
            val showAdsLinkRegex = Regex(
                """\s*<link[^>]+(?:show_ads_impl|pagead/managed/js/adsense)[^>]*>""",
                RegexOption.IGNORE_CASE
            )
            val originTrialMetaRegex = Regex(
                """\s*<meta[^>]+http-equiv=["']origin-trial["'][^>]*>""",
                RegexOption.IGNORE_CASE
            )
            val checkedHeadAttrRegex = Regex(
                """\s+data-checked-head=["'][^"']*["']""",
                RegexOption.IGNORE_CASE
            )
            val errorBoundAttrRegex = Regex(
                """\s+data-covfolio-error-bound=["'][^"']*["']""",
                RegexOption.IGNORE_CASE
            )
            val noAblateInsRegex = Regex(
                """\s*<ins\b[^>]*\badsbygoogle-noablate\b[^>]*>[\s\S]*?</ins>""",
                RegexOption.IGNORE_CASE
            )
            val aswiftHostRegex = Regex(
                """\s*<div\b[^>]*\bid=["']aswift_\d+_host["'][^>]*>[\s\S]*?</div>""",
                RegexOption.IGNORE_CASE
            )
            val aswiftIframeRegex = Regex(
                """\s*<iframe\b[^>]*\bid=["']aswift_\d+["'][^>]*>[\s\S]*?</iframe>""",
                RegexOption.IGNORE_CASE
            )
            val googleEsfRegex = Regex(
                """\s*<iframe\b[^>]*\bid=["']google_esf["'][^>]*>[\s\S]*?</iframe>""",
                RegexOption.IGNORE_CASE
            )

            exportDir.walkTopDown()
                .filter { it.isFile && it.extension.equals("html", ignoreCase = true) }
                .forEach { htmlFile ->
                    val original = htmlFile.readText(Charsets.UTF_8)
                    var cleaned = original
                    cleaned = showAdsScriptRegex.replace(cleaned, "")
                    cleaned = showAdsLinkRegex.replace(cleaned, "")
                    cleaned = originTrialMetaRegex.replace(cleaned, "")
                    cleaned = checkedHeadAttrRegex.replace(cleaned, "")
                    cleaned = errorBoundAttrRegex.replace(cleaned, "")
                    cleaned = noAblateInsRegex.replace(cleaned, "")
                    cleaned = aswiftHostRegex.replace(cleaned, "")
                    cleaned = aswiftIframeRegex.replace(cleaned, "")
                    cleaned = googleEsfRegex.replace(cleaned, "")
                    if (cleaned != original) {
                        htmlFile.writeText(cleaned, Charsets.UTF_8)
                        logger.lifecycle("Stripped SSR AdSense DOM pollution from ${htmlFile.relativeTo(exportDir)}")
                    }
                }
        }
    }
}

kotlin {
    // This example is frontend only. However, for a fullstack app, you can uncomment the includeServer parameter
    // and the `jvmMain` source set below.
    configAsKobwebApplication("kotfolio" /*, includeServer = true*/)

    sourceSets {
        val commonMain by getting {
            dependencies {
                implementation(compose.runtime)
            }
        }

        val jsMain by getting {
            dependencies {
                implementation(compose.html.core)
                implementation(libs.kobweb.core)
                implementation(libs.kobweb.silk)
                // This default template uses built-in SVG icons, but what's available is limited.
                // Uncomment the following if you want access to a large set of font-awesome icons:
                // implementation(libs.silk.icons.fa)
                implementation(libs.kobwebx.markdown)
            }
        }

        val jsTest by getting {
            dependencies {
                implementation(kotlin("test"))
            }
        }

        // Uncomment the following if you pass `includeServer = true` into the `configAsKobwebApplication` call.
//        val jvmMain by getting {
//            dependencies {
//                compileOnly(libs.kobweb.api) // Provided by Kobweb backend at runtime
//            }
//        }
    }
}
