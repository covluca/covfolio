(function () {
    "use strict";

    var PUBLISHER_ID = "ca-pub-2255472474228401";
    var H5_REWARD_TIMEOUT_MS = 1800;
    var H5_SHOW_TIMEOUT_MS = 15000;
    var PENDING_SETTLE_TIMEOUT_MS = 2500;

    var DEFAULT_SLOTS = {
        consoleSlotId: "1000000001",
        roofSlotId: "1000000002",
        continueSlotId: "1000000003",
        garageSlotId: "1000000004",
        podiumSlotId: "1000000005"
    };

    var PLACEHOLDER_IDS = {
        "0000000000": true,
        "1000000001": true,
        "1000000002": true,
        "1000000003": true,
        "1000000004": true,
        "1000000005": true
    };

    var SLOT_PROP_MAP = {
        console: "consoleSlotId",
        consoleSlotId: "consoleSlotId",
        roof: "roofSlotId",
        roofSlotId: "roofSlotId",
        continue: "continueSlotId",
        continueSlotId: "continueSlotId",
        garage: "garageSlotId",
        garageSlotId: "garageSlotId",
        podium: "podiumSlotId",
        podiumSlotId: "podiumSlotId"
    };

    function sanitizeSlotParam(value) {
        if (typeof value !== "string") return null;
        var trimmed = value.trim();
        if (/^[A-Za-z0-9_-]{1,32}$/.test(trimmed)) {
            return trimmed;
        }
        return null;
    }

    function isValidNumericSlotId(slotId) {
        return typeof slotId === "string" && /^\d{6,16}$/.test(slotId) && !PLACEHOLDER_IDS[slotId];
    }

    function isKobwebExporting() {
        try {
            var search = (window.location && window.location.search) ? window.location.search : "";
            return search.indexOf("_kobwebIsExporting=true") !== -1;
        } catch (_) {
            return false;
        }
    }

    function isLocalHost(hostname) {
        if (!hostname) return false;
        var host = String(hostname).toLowerCase();
        return (
            host === "localhost" ||
            host === "127.0.0.1" ||
            host === "::1" ||
            host === "[::1]" ||
            host.endsWith(".localhost")
        );
    }

    function captureHostOverrides() {
        var existing = window.COVFOLIO_AD_CONFIG;
        var out = {};
        if (!existing || typeof existing !== "object") {
            return out;
        }
        var keys = ["consoleSlotId", "roofSlotId", "continueSlotId", "garageSlotId", "podiumSlotId"];
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            var clean = sanitizeSlotParam(existing[k]);
            if (clean !== null) out[k] = clean;
        }
        if (typeof existing.testMode === "boolean") {
            out.testMode = existing.testMode;
        }
        if (typeof existing.allowPlaceholderPush === "boolean") {
            out.allowPlaceholderPush = existing.allowPlaceholderPush;
        }
        if (typeof existing.h5RewardTimeoutMs === "number" && existing.h5RewardTimeoutMs > 0) {
            out.h5RewardTimeoutMs = existing.h5RewardTimeoutMs;
        }
        if (typeof existing.h5ShowTimeoutMs === "number" && existing.h5ShowTimeoutMs > 0) {
            out.h5ShowTimeoutMs = existing.h5ShowTimeoutMs;
        }
        return out;
    }

    var hostOverrides = captureHostOverrides();

    function parseQueryOverrides() {
        var result = {};
        try {
            var search = (window.location && window.location.search) ? window.location.search : "";
            if (!search) return result;
            var params = new URLSearchParams(search);

            var adtest = params.get("adtest");
            if (adtest !== null) {
                var norm = adtest.trim().toLowerCase();
                if (norm === "on" || norm === "true" || norm === "1") {
                    result.testMode = true;
                } else if (norm === "off" || norm === "false" || norm === "0") {
                    result.testMode = false;
                }
            }

            var paramMap = [
                ["adslot_console", "consoleSlotId"],
                ["adslot_roof", "roofSlotId"],
                ["adslot_continue", "continueSlotId"],
                ["adslot_garage", "garageSlotId"],
                ["adslot_podium", "podiumSlotId"]
            ];
            for (var i = 0; i < paramMap.length; i++) {
                var raw = params.get(paramMap[i][0]);
                var clean = sanitizeSlotParam(raw);
                if (clean !== null) {
                    result[paramMap[i][1]] = clean;
                }
            }
        } catch (_) {
            // Ignore malformed query strings
        }
        return result;
    }

    function getConfig() {
        var query = parseQueryOverrides();
        var exporting = isKobwebExporting();
        var defaultTestMode = exporting
            ? false
            : (typeof hostOverrides.testMode === "boolean"
                ? hostOverrides.testMode
                : isLocalHost(window.location && window.location.hostname));

        var config = {
            publisherId: PUBLISHER_ID,
            consoleSlotId: query.consoleSlotId || hostOverrides.consoleSlotId || DEFAULT_SLOTS.consoleSlotId,
            roofSlotId: query.roofSlotId || hostOverrides.roofSlotId || DEFAULT_SLOTS.roofSlotId,
            continueSlotId: query.continueSlotId || hostOverrides.continueSlotId || DEFAULT_SLOTS.continueSlotId,
            garageSlotId: query.garageSlotId || hostOverrides.garageSlotId || DEFAULT_SLOTS.garageSlotId,
            podiumSlotId: query.podiumSlotId || hostOverrides.podiumSlotId || DEFAULT_SLOTS.podiumSlotId,
            testMode: exporting ? false : (typeof query.testMode === "boolean" ? query.testMode : defaultTestMode),
            allowPlaceholderPush: hostOverrides.allowPlaceholderPush === true,
            h5RewardTimeoutMs: typeof hostOverrides.h5RewardTimeoutMs === "number"
                ? hostOverrides.h5RewardTimeoutMs
                : H5_REWARD_TIMEOUT_MS,
            h5ShowTimeoutMs: typeof hostOverrides.h5ShowTimeoutMs === "number"
                ? hostOverrides.h5ShowTimeoutMs
                : H5_SHOW_TIMEOUT_MS
        };

        window.COVFOLIO_AD_CONFIG = config;
        return config;
    }

    function getPublisherId() {
        return PUBLISHER_ID;
    }

    function getSlotId(slotKey) {
        var cfg = getConfig();
        var prop = SLOT_PROP_MAP[slotKey] || slotKey;
        return cfg[prop] || DEFAULT_SLOTS.consoleSlotId;
    }

    function isBlocked() {
        try {
            return Boolean(
                window.__adsenseBlocked === true ||
                !window.adsbygoogle ||
                typeof window.adsbygoogle.push !== "function" ||
                window.adsbygoogle.loaded !== true
            );
        } catch (_) {
            return true;
        }
    }

    function getSlotStatus(insElement) {
        if (!insElement || typeof insElement.getAttribute !== "function") {
            return "idle";
        }
        try {
            var adStatus = insElement.getAttribute("data-ad-status");
            if (adStatus === "filled") return "filled";
            if (adStatus === "unfilled") return "unfilled";

            var state = insElement.dataset ? insElement.dataset.covfolioAdState : null;
            if (state === "filled" || state === "unfilled" || state === "pending" || state === "blocked" || state === "idle") {
                if (state === "pending" && window.__adsenseBlocked === true) {
                    return "blocked";
                }
                return state;
            }
            if (window.__adsenseBlocked === true) {
                return "blocked";
            }
            return "idle";
        } catch (_) {
            return "idle";
        }
    }

    var observedSlots = typeof WeakMap !== "undefined" ? new WeakMap() : null;
    var pendingSlotEntries = [];

    function notifySlotEntry(entry) {
        if (!entry || !entry.el || typeof entry.cb !== "function") return;
        var nextStatus = getSlotStatus(entry.el);
        if (nextStatus !== entry.lastNotifiedStatus) {
            entry.lastNotifiedStatus = nextStatus;
            try {
                entry.cb(nextStatus);
            } catch (_) {
                // Never propagate observer callback errors
            }
        }
    }

    function removePendingEntry(insElement) {
        for (var i = pendingSlotEntries.length - 1; i >= 0; i--) {
            if (pendingSlotEntries[i].el === insElement) {
                pendingSlotEntries.splice(i, 1);
            }
        }
    }

    function unobserveSlot(insElement) {
        if (!insElement || !observedSlots) return;
        try {
            var entry = observedSlots.get(insElement);
            if (entry) {
                if (entry.observer) {
                    entry.observer.disconnect();
                }
                if (entry.settleTimer) {
                    clearTimeout(entry.settleTimer);
                }
                observedSlots.delete(insElement);
            }
            removePendingEntry(insElement);
        } catch (_) {
            // Safe no-op
        }
    }

    function attachSlotObserver(insElement, onStatusChange) {
        if (!observedSlots || !insElement) return null;
        var entry = observedSlots.get(insElement);
        if (!entry) {
            entry = {
                el: insElement,
                cb: typeof onStatusChange === "function" ? onStatusChange : null,
                observer: null,
                settleTimer: null,
                lastNotifiedStatus: null
            };
            if (typeof MutationObserver !== "undefined") {
                entry.observer = new MutationObserver(function () {
                    var status = getSlotStatus(insElement);
                    if (status === "filled" || status === "unfilled") {
                        if (insElement.dataset) {
                            insElement.dataset.covfolioAdState = status;
                        }
                        if (entry.settleTimer) {
                            clearTimeout(entry.settleTimer);
                            entry.settleTimer = null;
                        }
                        removePendingEntry(insElement);
                    }
                    notifySlotEntry(entry);
                });
                entry.observer.observe(insElement, {
                    attributes: true,
                    attributeFilter: ["data-ad-status", "data-adsbygoogle-status"]
                });
            }
            observedSlots.set(insElement, entry);
        } else if (typeof onStatusChange === "function") {
            entry.cb = onStatusChange;
        }
        return entry;
    }

    function isElementHiddenOrZeroWidth(el) {
        if (!el || !el.isConnected) return true;
        try {
            var style = window.getComputedStyle(el);
            if (!style || style.display === "none" || style.visibility === "hidden") {
                return true;
            }
            if ((el.offsetWidth || 0) <= 0) {
                return true;
            }
        } catch (_) {
            return true;
        }
        return false;
    }

    function pushSlotOnce(insElement, slotKey, onStatusChange) {
        if (!insElement || typeof insElement.setAttribute !== "function") {
            return { pushed: false, status: "idle" };
        }
        try {
            var cfg = getConfig();
            var slotId = getSlotId(slotKey);

            insElement.setAttribute("data-ad-client", cfg.publisherId);
            insElement.setAttribute("data-ad-slot", slotId);
            if (cfg.testMode === true && !isKobwebExporting()) {
                insElement.setAttribute("data-adtest", "on");
            } else {
                insElement.removeAttribute("data-adtest");
            }

            if (isKobwebExporting()) {
                return { pushed: false, status: "idle" };
            }

            attachAdSenseScriptErrorListener();
            var entry = attachSlotObserver(insElement, onStatusChange);

            if (isElementHiddenOrZeroWidth(insElement)) {
                return { pushed: false, status: "idle" };
            }

            var alreadyPushed =
                insElement.hasAttribute("data-adsbygoogle-status") ||
                (insElement.dataset && insElement.dataset.covfolioPushed === "1");

            if (alreadyPushed) {
                return { pushed: false, status: getSlotStatus(insElement) };
            }

            if (window.__adsenseBlocked === true) {
                if (insElement.dataset) {
                    insElement.dataset.covfolioAdState = "blocked";
                }
                notifySlotEntry(entry);
                return { pushed: false, status: "blocked" };
            }

            if (!cfg.allowPlaceholderPush && !isValidNumericSlotId(slotId)) {
                insElement.setAttribute("data-ad-status", "unfilled");
                if (insElement.dataset) {
                    insElement.dataset.covfolioAdState = "unfilled";
                }
                notifySlotEntry(entry);
                return { pushed: false, status: "unfilled" };
            }

            if (insElement.dataset) {
                insElement.dataset.covfolioPushed = "1";
                insElement.dataset.covfolioAdState = "pending";
            }

            if (entry) {
                pendingSlotEntries.push(entry);
                if (entry.settleTimer) clearTimeout(entry.settleTimer);
                entry.settleTimer = setTimeout(function () {
                    entry.settleTimer = null;
                    removePendingEntry(insElement);
                    var currentStatus = getSlotStatus(insElement);
                    if (currentStatus === "pending") {
                        var resolved = isBlocked() ? "blocked" : "unfilled";
                        if (insElement.dataset) {
                            insElement.dataset.covfolioAdState = resolved;
                        }
                        notifySlotEntry(entry);
                    }
                }, PENDING_SETTLE_TIMEOUT_MS);
            }

            window.adsbygoogle = window.adsbygoogle || [];
            window.adsbygoogle.push({});
            var statusNow = getSlotStatus(insElement);
            notifySlotEntry(entry);
            return { pushed: true, status: statusNow };
        } catch (_) {
            return { pushed: false, status: getSlotStatus(insElement) };
        }
    }

    function markPendingSlotsBlocked() {
        window.__adsenseBlocked = true;
        for (var i = pendingSlotEntries.length - 1; i >= 0; i--) {
            var entry = pendingSlotEntries[i];
            if (entry && entry.el) {
                if (entry.el.dataset) {
                    entry.el.dataset.covfolioAdState = "blocked";
                }
                if (entry.settleTimer) {
                    clearTimeout(entry.settleTimer);
                    entry.settleTimer = null;
                }
                notifySlotEntry(entry);
            }
            pendingSlotEntries.splice(i, 1);
        }
    }

    var boundErrorScripts = typeof WeakSet === "function" ? new WeakSet() : null;
    var boundErrorScriptsFallback = [];

    function isErrorListenerBound(script) {
        if (!script) return false;
        if (boundErrorScripts) {
            return boundErrorScripts.has(script);
        }
        return boundErrorScriptsFallback.indexOf(script) !== -1;
    }

    function markErrorListenerBound(script) {
        if (!script) return;
        if (boundErrorScripts) {
            boundErrorScripts.add(script);
        } else if (boundErrorScriptsFallback.indexOf(script) === -1) {
            boundErrorScriptsFallback.push(script);
        }
    }

    function attachAdSenseScriptErrorListener() {
        try {
            var script = document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]');
            if (script && !isErrorListenerBound(script)) {
                markErrorListenerBound(script);
                script.addEventListener("error", function () {
                    markPendingSlotsBlocked();
                });
            }
        } catch (_) {
            // Safe no-op
        }
    }

    function requestRewardedContinue(opts) {
        var options = opts || {};
        var onReadyFallback = typeof options.onReadyFallback === "function" ? options.onReadyFallback : function () {};
        var onGrant = typeof options.onGrant === "function" ? options.onGrant : function () {};
        var onCancel = typeof options.onCancel === "function" ? options.onCancel : function () {};
        var muted = Boolean(options.muted);

        var cfg = getConfig();
        var timeoutMs = (typeof options.timeoutMs === "number" && options.timeoutMs > 0)
            ? options.timeoutMs
            : (cfg.h5RewardTimeoutMs || H5_REWARD_TIMEOUT_MS);
        var showTimeoutMs = (typeof options.showTimeoutMs === "number" && options.showTimeoutMs > 0)
            ? options.showTimeoutMs
            : (cfg.h5ShowTimeoutMs || H5_SHOW_TIMEOUT_MS);
        var settled = false;
        var timeoutId = null;
        var showTimeoutId = null;

        function settle(fn, arg) {
            if (settled) return;
            settled = true;
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
            if (showTimeoutId !== null) {
                clearTimeout(showTimeoutId);
                showTimeoutId = null;
            }
            try {
                fn(arg);
            } catch (_) {
                // Never propagate caller errors
            }
        }

        if (isBlocked()) {
            settle(onReadyFallback, "blocked");
            return;
        }

        try {
            timeoutId = setTimeout(function () {
                settle(onReadyFallback, "timeout");
            }, timeoutMs);

            if (typeof window.adConfig === "function") {
                window.adConfig({ sound: muted ? "off" : "on" });
            }

            if (typeof window.adBreak !== "function") {
                settle(onReadyFallback, "unavailable");
                return;
            }

            window.adBreak({
                type: "reward",
                name: "continue_run",
                beforeAd: function () {},
                afterAd: function () {},
                beforeReward: function (showAdFn) {
                    if (timeoutId !== null) {
                        clearTimeout(timeoutId);
                        timeoutId = null;
                    }
                    if (!settled && typeof showAdFn === "function") {
                        showTimeoutId = setTimeout(function () {
                            settle(onReadyFallback, "timeout");
                        }, showTimeoutMs);
                        try {
                            showAdFn();
                        } catch (_) {
                            settle(onReadyFallback, "error");
                        }
                    } else if (!settled) {
                        settle(onReadyFallback, "unavailable");
                    }
                },
                adViewed: function () {
                    settle(onGrant);
                },
                adDismissed: function () {
                    settle(onCancel, "dismissed");
                },
                adBreakDone: function (placementInfo) {
                    var status = placementInfo && placementInfo.breakStatus ? String(placementInfo.breakStatus) : "unavailable";
                    if (status === "viewed") {
                        settle(onGrant);
                    } else if (status === "dismissed") {
                        settle(onCancel, "dismissed");
                    } else {
                        settle(onReadyFallback, status);
                    }
                }
            });
        } catch (_) {
            settle(onReadyFallback, "error");
        }
    }

    try {
        getConfig();
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", attachAdSenseScriptErrorListener, { once: true });
        } else {
            attachAdSenseScriptErrorListener();
        }

        window.__COVFOLIO_ADS__ = {
            getConfig: getConfig,
            getPublisherId: getPublisherId,
            getSlotId: getSlotId,
            isBlocked: isBlocked,
            getSlotStatus: getSlotStatus,
            pushSlotOnce: pushSlotOnce,
            unobserveSlot: unobserveSlot,
            requestRewardedContinue: requestRewardedContinue
        };
    } catch (_) {
        // Guarantee <head> execution never throws
    }
})();
