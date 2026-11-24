/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RawLookupResponse } from "./types";

const API_URL = "https://haunt.gg/api/lookup/user";
const TIMEOUT_MS = 10_000;

/** A Discord snowflake. The API accepts 17 to 19 digits today. */
export const DISCORD_ID_PATTERN = /^\d{17,20}$/;

/**
 * The one request the plugin makes. Shared by the main process (`native.ts`)
 * and the web build, so it must not import anything from the renderer.
 * Never throws: a request that got no answer comes back as `status: 0`.
 */
export async function requestLookup(apiKey: string, discordId: string): Promise<RawLookupResponse> {
    if (typeof apiKey !== "string" || typeof discordId !== "string" || !DISCORD_ID_PATTERN.test(discordId))
        return { status: 0, retryAfter: null, data: "Invalid lookup arguments" };

    const params = new URLSearchParams({
        type: "discord",
        value: discordId,
        badges: "true",
        views: "true",
        feedback: "true"
    });

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
