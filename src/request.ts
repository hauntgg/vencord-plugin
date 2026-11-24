/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { LOOKUP_INCLUDES, LOOKUP_TYPES, LookupInclude, LookupTarget, RawLookupResponse } from "./types";

const API_URL = "https://haunt.gg/api/lookup/user";
const TIMEOUT_MS = 10_000;

/** A Discord snowflake. The API accepts 17 to 19 digits today. */
export const DISCORD_ID_PATTERN = /^\d{17,20}$/;
/** The API's own cap on a lookup value. */
const VALUE_MAX = 64;

function isValidTarget(target: LookupTarget) {
    if (typeof target !== "object" || target === null) return false;
    if (!LOOKUP_TYPES.includes(target.type) || typeof target.value !== "string") return false;

    return target.type === "discord"
        ? DISCORD_ID_PATTERN.test(target.value)
        : target.value.length > 0 && target.value.length <= VALUE_MAX;
}

/**
 * The one request the plugin makes. Shared by the main process (`native.ts`)
 * and the web build, so it must not import anything from the renderer.
 * Never throws: a request that got no answer comes back as `status: 0`.
 */
export async function requestLookup(apiKey: string, target: LookupTarget, includes: readonly LookupInclude[]): Promise<RawLookupResponse> {
    if (typeof apiKey !== "string" || !isValidTarget(target) || !Array.isArray(includes))
        return { status: 0, retryAfter: null, data: "Invalid lookup arguments" };

    const params = new URLSearchParams({ type: target.type, value: target.value });
    for (const include of LOOKUP_INCLUDES) {
        if (includes.includes(include)) params.set(include, "true");
    }

    try {
        const res = await fetch(`${API_URL}?${params}`, {
            headers: {
                "X-API-Key": apiKey,
                Accept: "application/json"
            },
            signal: AbortSignal.timeout(TIMEOUT_MS)
        });

        return {
            status: res.status,
            retryAfter: res.headers.get("retry-after"),
            data: await res.text()
        };
    } catch (e) {
        const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");

        return {
            status: 0,
            retryAfter: null,
            data: timedOut ? `No answer from haunt.gg within ${TIMEOUT_MS / 1000}s` : String(e)
        };
    }
}
