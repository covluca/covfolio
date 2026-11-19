package com.binayshaw7777.kotfolio.game

import kotlinx.browser.window
import org.w3c.dom.Element
import org.w3c.dom.url.URLSearchParams

enum class AdSlotKey(
    val key: String,
    val placementName: String,
    val defaultSlotId: String
) {
    CONSOLE("console", "driver-console", "1000000001"),
    ROOF("roof", "third-person-roof", "1000000002"),
    CONTINUE("continue", "watch-continue", "1000000003"),
    GARAGE("garage", "pre-race-garage", "1000000004"),
    PODIUM("podium", "post-race-podium", "1000000005")
}

enum class AdSlotStatus(val wireValue: String) {
    FILLED("filled"),
    UNFILLED("unfilled"),
    PENDING("pending"),
    BLOCKED("blocked"),
    IDLE("idle");

    companion object {
        fun fromWire(value: String?): AdSlotStatus =
            entries.firstOrNull { it.wireValue.equals(value, ignoreCase = true) } ?: IDLE
    }
}

data class AdRuntimeConfig(
    val publisherId: String = AdConfig.PUBLISHER_ID,
    val consoleSlotId: String = AdSlotKey.CONSOLE.defaultSlotId,
    val roofSlotId: String = AdSlotKey.ROOF.defaultSlotId,
    val continueSlotId: String = AdSlotKey.CONTINUE.defaultSlotId,
    val garageSlotId: String = AdSlotKey.GARAGE.defaultSlotId,
    val podiumSlotId: String = AdSlotKey.PODIUM.defaultSlotId,
    val testMode: Boolean = false,
    val h5RewardTimeoutMs: Int = AdConfig.DEFAULT_H5_TIMEOUT_MS
) {
    fun slotIdFor(slotKey: AdSlotKey): String = when (slotKey) {
        AdSlotKey.CONSOLE -> consoleSlotId
        AdSlotKey.ROOF -> roofSlotId
        AdSlotKey.CONTINUE -> continueSlotId
        AdSlotKey.GARAGE -> garageSlotId
        AdSlotKey.PODIUM -> podiumSlotId
    }
}

data class AdPushResult(
    val pushed: Boolean,
    val status: AdSlotStatus
)

external interface CovfolioAdConfigJs {
    val publisherId: String?
    val consoleSlotId: String?
    val roofSlotId: String?
    val continueSlotId: String?
    val garageSlotId: String?
    val podiumSlotId: String?
    val testMode: Boolean?
    val h5RewardTimeoutMs: Int?
}

external interface AdPushResultJs {
    val pushed: Boolean?
    val status: String?
}

external interface CovfolioAdsManagerJs {
    fun getConfig(): CovfolioAdConfigJs?
    fun getPublisherId(): String?
    fun getSlotId(slotKey: String): String?
    fun isBlocked(): Boolean
    fun getSlotStatus(insElement: Element?): String?
    fun pushSlotOnce(
        insElement: Element?,
        slotKey: String,
        onStatusChange: ((String) -> Unit)? = definedExternally
    ): AdPushResultJs?

    fun unobserveSlot(insElement: Element?)
    fun requestRewardedContinue(options: dynamic)
}

object AdConfig {
    const val PUBLISHER_ID = "ca-pub-2255472474228401"
    const val DEFAULT_H5_TIMEOUT_MS = 1800

    fun managerOrNull(): CovfolioAdsManagerJs? = runCatching {
        val raw = window.asDynamic().__COVFOLIO_ADS__
        if (raw == null || raw == undefined) null else raw.unsafeCast<CovfolioAdsManagerJs>()
    }.getOrNull()

    fun currentConfig(): AdRuntimeConfig {
        val jsCfg = runCatching { managerOrNull()?.getConfig() }.getOrNull()
        if (jsCfg != null) {
            return AdRuntimeConfig(
                publisherId = jsCfg.publisherId ?: PUBLISHER_ID,
                consoleSlotId = jsCfg.consoleSlotId ?: AdSlotKey.CONSOLE.defaultSlotId,
                roofSlotId = jsCfg.roofSlotId ?: AdSlotKey.ROOF.defaultSlotId,
                continueSlotId = jsCfg.continueSlotId ?: AdSlotKey.CONTINUE.defaultSlotId,
                garageSlotId = jsCfg.garageSlotId ?: AdSlotKey.GARAGE.defaultSlotId,
                podiumSlotId = jsCfg.podiumSlotId ?: AdSlotKey.PODIUM.defaultSlotId,
                testMode = jsCfg.testMode ?: isLocalHostFallback(),
                h5RewardTimeoutMs = jsCfg.h5RewardTimeoutMs ?: DEFAULT_H5_TIMEOUT_MS
            )
        }
        return fallbackConfig()
    }

    fun slotIdFor(slotKey: AdSlotKey): String {
        val jsId = runCatching { managerOrNull()?.getSlotId(slotKey.key) }.getOrNull()
        return if (!jsId.isNullOrBlank()) jsId else currentConfig().slotIdFor(slotKey)
    }

    fun isTestMode(): Boolean = currentConfig().testMode

    fun isBlocked(): Boolean = runCatching {
        managerOrNull()?.isBlocked() ?: ((window.asDynamic().__adsenseBlocked as? Boolean) == true)
    }.getOrDefault(true)

    fun pushSlotOnce(
        insElement: Element?,
        slotKey: AdSlotKey,
        onStatusChange: ((AdSlotStatus) -> Unit)? = null
    ): AdPushResult {
        if (insElement == null) return AdPushResult(pushed = false, status = AdSlotStatus.IDLE)
        return runCatching {
            val manager = managerOrNull() ?: return AdPushResult(false, if (isBlocked()) AdSlotStatus.BLOCKED else AdSlotStatus.IDLE)
            val callback: ((String) -> Unit)? = if (onStatusChange != null) {
                { wire -> onStatusChange(AdSlotStatus.fromWire(wire)) }
            } else {
                null
            }
            val res = manager.pushSlotOnce(insElement, slotKey.key, callback)
            AdPushResult(
                pushed = res?.pushed == true,
                status = AdSlotStatus.fromWire(res?.status)
            )
        }.getOrElse {
            AdPushResult(pushed = false, status = if (isBlocked()) AdSlotStatus.BLOCKED else AdSlotStatus.IDLE)
        }
    }

    fun getSlotStatus(insElement: Element?): AdSlotStatus {
        if (insElement == null) return AdSlotStatus.IDLE
        return runCatching {
            val wire = managerOrNull()?.getSlotStatus(insElement)
            AdSlotStatus.fromWire(wire)
        }.getOrDefault(AdSlotStatus.IDLE)
    }

    fun unobserveSlot(insElement: Element?) {
        if (insElement == null) return
        runCatching { managerOrNull()?.unobserveSlot(insElement) }
    }

    fun requestRewardedContinue(
        muted: Boolean,
        onReadyFallback: (String) -> Unit,
        onGrant: () -> Unit,
        onCancel: (String?) -> Unit
    ) {
        val manager = managerOrNull()
        if (manager == null) {
            onReadyFallback("unavailable")
            return
        }
        runCatching {
            val opts = js("({})")
            opts.muted = muted
            opts.onReadyFallback = { reason: dynamic ->
                onReadyFallback((reason as? String) ?: "unavailable")
            }
            opts.onGrant = {
                onGrant()
            }
            opts.onCancel = { reason: dynamic ->
                onCancel(reason as? String)
            }
            manager.requestRewardedContinue(opts)
        }.onFailure {
            onReadyFallback("error")
        }
    }

    private fun isLocalHostFallback(): Boolean {
        val host = runCatching { window.location.hostname.lowercase() }.getOrDefault("")
        return host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]" || host.endsWith(".localhost")
    }

    private fun fallbackConfig(): AdRuntimeConfig {
        val pre = runCatching { window.asDynamic().COVFOLIO_AD_CONFIG }.getOrNull()
        val params = runCatching { URLSearchParams(window.location.search) }.getOrNull()

        fun pickSlot(paramName: String, propName: String, defaultId: String): String {
            val q = params?.get(paramName)?.trim()
            if (!q.isNullOrEmpty() && q.matches(Regex("^[A-Za-z0-9_-]{1,32}$"))) return q
            val p = if (pre != null && pre != undefined) (pre[propName] as? String)?.trim() else null
            if (!p.isNullOrEmpty()) return p
            return defaultId
        }

        val adtestParam = params?.get("adtest")?.trim()?.lowercase()
        val testMode = when (adtestParam) {
            "on", "true", "1" -> true
            "off", "false", "0" -> false
            else -> (pre?.testMode as? Boolean) ?: isLocalHostFallback()
        }

        return AdRuntimeConfig(
            publisherId = PUBLISHER_ID,
            consoleSlotId = pickSlot("adslot_console", "consoleSlotId", AdSlotKey.CONSOLE.defaultSlotId),
            roofSlotId = pickSlot("adslot_roof", "roofSlotId", AdSlotKey.ROOF.defaultSlotId),
            continueSlotId = pickSlot("adslot_continue", "continueSlotId", AdSlotKey.CONTINUE.defaultSlotId),
            garageSlotId = pickSlot("adslot_garage", "garageSlotId", AdSlotKey.GARAGE.defaultSlotId),
            podiumSlotId = pickSlot("adslot_podium", "podiumSlotId", AdSlotKey.PODIUM.defaultSlotId),
            testMode = testMode,
            h5RewardTimeoutMs = (pre?.h5RewardTimeoutMs as? Int) ?: DEFAULT_H5_TIMEOUT_MS
        )
    }
}
