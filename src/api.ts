/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import { PluginNative } from "@utils/types";

import { requestLookup } from "./request";
import { HauntAccountStatus, HauntBadge, HauntErrorBody, HauntFeedback, HauntProfile, HauntUser, RawLookupResponse } from "./types";

export const logger = new Logger("Haunt");

const Native = VencordNative.pluginHelpers.Haunt as PluginNative<typeof import("./native")>;

/** What every haunt.gg key starts with. */
const API_KEY_PREFIX = "haunt_";
const API_KEY_MIN_LENGTH = API_KEY_PREFIX.length + 16;

/** Cheap check before a key is sent anywhere, so a half-typed key never costs a request. */
export function isPlausibleApiKey(apiKey: string) {
    return apiKey.startsWith(API_KEY_PREFIX) && apiKey.length >= API_KEY_MIN_LENGTH && !/\s/.test(apiKey);
}

export type LookupResult =
    /** The account, readable. */
    | { kind: "ok"; profile: HauntProfile; }
    /** No haunt.gg account is linked to this Discord account. */
    | { kind: "none"; }
    /** An account exists, but the API does not hand it out. */
    | { kind: "status"; status: HauntAccountStatus; message: string; }
    /** The key itself is the problem. Asking again with it is pointless. */
    | { kind: "key"; code: string; message: string; }
    | { kind: "ratelimited"; retryAfterMs: number; }
    /** Anything else: no answer, a server error, an answer that makes no sense. */
    | { kind: "error"; message: string; };

/** Codes of `/api/lookup/user` that describe the looked-up account. */
const STATUS_CODES: Record<string, HauntAccountStatus> = {
    USER_BANNED: "banned",
    PROFILE_PRIVATE: "private",
    USER_UNAVAILABLE: "unavailable"
};

const STATUS_FALLBACK_MESSAGES: Record<HauntAccountStatus, string> = {
    banned: "This account is banned.",
    private: "This profile is private.",
    unavailable: "This account is not available."
};

/** Codes that say the key cannot be used, whatever the status they arrive with. */
const KEY_MESSAGES: Record<string, string> = {
    UNAUTHORIZED: "The API key was not accepted",
    INVALID_API_KEY: "The API key is invalid",
    KEY_NOT_FOUND: "The API key is unknown or lacks the lookup:user permission",
    KEY_EXPIRED: "The API key has expired",
    USAGE_EXCEEDED: "The API key has used up its request quota",
    KEY_DISABLED: "The API key was disabled",
    KEY_LOCKED: "The API key is locked because its account holds more keys than its plan allows",
    KEY_OWNER_UNAVAILABLE: "The account the API key belongs to is banned, disabled or scheduled for deletion",
    INSUFFICIENT_PERMISSIONS: "The API key lacks the lookup:user permission"
};

const RATE_LIMIT_DEFAULT_MS = 60_000;
const RATE_LIMIT_MAX_MS = 10 * 60_000;

function request(apiKey: string, discordId: string): Promise<RawLookupResponse> {
    // The web build has no main process. haunt.gg sends no CORS headers for
    // this route, so this fails there, but with a proper error instead of a crash.
    return IS_WEB ? requestLookup(apiKey, discordId) : Native.lookupUser(apiKey, discordId);
}

function parseJson(data: string): unknown {
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

function parseError(body: unknown): HauntErrorBody | null {
    if (!isObject(body) || typeof body.error !== "string") return null;

    return typeof body.code === "string"
        ? { error: body.error, code: body.code.toUpperCase() }
        : { error: body.error };
}

function parseUser(raw: unknown): HauntUser | null {
    if (!isObject(raw)) return null;
    if (typeof raw.id !== "string" || typeof raw.username !== "string" || !raw.username) return null;
    if (typeof raw.uid !== "number" || !Number.isFinite(raw.uid)) return null;

    return {
        id: raw.id,
        uid: raw.uid,
        username: raw.username,
        name: typeof raw.name === "string" ? raw.name : null,
        avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
        discordId: typeof raw.discordId === "string" ? raw.discordId : null,
        lastfmUsername: typeof raw.lastfmUsername === "string" ? raw.lastfmUsername : null,
        premium: raw.premium === true,
        verified: raw.verified === true,
        imagehost: raw.imagehost === true,
        inactive: raw.inactive === true,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : ""
    };
}

function parseBadges(raw: unknown): HauntBadge[] {
    if (!Array.isArray(raw)) return [];

    return raw
        .filter((badge): badge is Record<string, unknown> => isObject(badge) && typeof badge.id === "string")
        .map((badge, index) => ({
            ...badge,
            order: typeof badge.order === "number" ? badge.order : index,
            enabled: badge.enabled !== false,
            unlockedTiers: Array.isArray(badge.unlockedTiers) ? badge.unlockedTiers.filter(tier => typeof tier === "number") : [],
            tiers: Array.isArray(badge.tiers) ? badge.tiers.filter(isObject) : []
        }) as unknown as HauntBadge);
}

function parseFeedback(raw: unknown): HauntFeedback | null {
    if (!isObject(raw) || typeof raw.likes !== "number" || typeof raw.dislikes !== "number") return null;
    return { likes: raw.likes, dislikes: raw.dislikes };
}

function parseProfile(body: unknown): HauntProfile | null {
    if (!isObject(body)) return null;

    const user = parseUser(body.user);
    if (!user) return null;

    return {
        user,
        badges: parseBadges(body.badges),
        views: typeof body.views === "number" ? body.views : null,
        feedback: parseFeedback(body.feedback)
    };
}

/** `Retry-After` is seconds or an HTTP date. Only the per-IP limit sends it, the per-key limit does not. */
function retryAfterMs(header: string | null) {
    if (!header) return RATE_LIMIT_DEFAULT_MS;

    const seconds = Number(header);
    const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return RATE_LIMIT_DEFAULT_MS;

    // One second on top: the limiter rounds its reset down to whole seconds.
    return Math.min(ms + 1000, RATE_LIMIT_MAX_MS);
}

export function classifyResponse({ status, retryAfter, data }: RawLookupResponse): LookupResult {
    if (status === 0) return { kind: "error", message: data || "No answer from haunt.gg" };

    const body = parseJson(data);

    if (status >= 200 && status < 300) {
        const profile = parseProfile(body);
        return profile
            ? { kind: "ok", profile }
            : { kind: "error", message: "haunt.gg answered with something that is not a user" };
    }

    const error = parseError(body);
    const code = error?.code;

    // `code` is what the API promises to keep stable, so it decides before the status does.
    if (code != null) {
        const accountStatus = Object.hasOwn(STATUS_CODES, code) ? STATUS_CODES[code] : undefined;
        if (accountStatus)
            return { kind: "status", status: accountStatus, message: error!.error || STATUS_FALLBACK_MESSAGES[accountStatus] };

        if (code === "NOT_FOUND") return { kind: "none" };
        if (code === "RATE_LIMITED") return { kind: "ratelimited", retryAfterMs: retryAfterMs(retryAfter) };

        if (Object.hasOwn(KEY_MESSAGES, code) || status === 401)
            return { kind: "key", code, message: KEY_MESSAGES[code] ?? error!.error };

        return { kind: "error", message: `${error!.error} (${code}, HTTP ${status})` };
    }

    if (status === 429) return { kind: "ratelimited", retryAfterMs: retryAfterMs(retryAfter) };
    if (status === 401) return { kind: "key", code: "UNAUTHORIZED", message: error?.error ?? KEY_MESSAGES.UNAUTHORIZED };

    // A 403 or 404 without a code did not come from the lookup route (a proxy,
    // a firewall, a moved endpoint). It says nothing about the account or the key.
    return { kind: "error", message: error?.error ?? `haunt.gg answered with HTTP ${status}` };
}

export async function lookupByDiscordId(apiKey: string, discordId: string): Promise<LookupResult> {
    try {
        return classifyResponse(await request(apiKey, discordId));
    } catch (e) {
        // Only reachable when the bridge to the main process itself fails.
        return { kind: "error", message: e instanceof Error ? e.message : String(e) };
    }
}
