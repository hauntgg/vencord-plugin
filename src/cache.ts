/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { debounce } from "@shared/debounce";
import { useEffect, useState } from "@webpack/common";

import { settings } from ".";
import { isPlausibleApiKey, logger, lookupByDiscordId, LookupResult } from "./api";
import { HauntAccountStatus, HauntProfile } from "./types";

const STORE_KEY = "haunt-profile-cache-v2";
/** Keys of earlier cache formats, removed on start. */
const LEGACY_STORE_KEYS = ["haunt-profile-cache"];

/** Entries kept in memory. Past it the expired ones go first, then the oldest. */
const MAX_ENTRIES = 5000;

/** One user's lookup failed: wait this long before asking for them again, doubling per failure. */
const USER_RETRY_BASE = 60_000;
const USER_RETRY_MAX = 15 * 60_000;

/** This many failures in a row mean haunt.gg is unreachable: every lookup pauses, doubling per failure. */
const OUTAGE_THRESHOLD = 3;
const OUTAGE_PAUSE_BASE = 30_000;
const OUTAGE_PAUSE_MAX = 5 * 60_000;

/** A rejected key is tried again by itself: a locked or exhausted key can start working without being changed. */
const KEY_RETRY_BASE = 5 * 60_000;
const KEY_RETRY_MAX = 60 * 60_000;

/** What a lookup can settle on. Everything else (errors, rate limits) is retried and never cached. */
export type CachedResult =
    | { kind: "ok"; profile: HauntProfile; }
    | { kind: "none"; }
    | { kind: "status"; status: HauntAccountStatus; message: string; };

/** What a component gets to render. */
export type HauntState =
    | CachedResult
    /** The lookup failed and there is no earlier answer to fall back on. */
    | { kind: "error"; message: string; }
    /** Nothing known: not looked up yet, lookups switched off, or no usable key. */
    | { kind: "unknown"; };

export interface KeyProblem {
    code: string;
    message: string;
}

export interface LookupStatus {
    cached: number;
    queued: number;
    keyProblem: KeyProblem | null;
    /** Timestamps, 0 when not paused. */
    rateLimitedUntil: number;
    outageUntil: number;
    lastError: string | null;
}

interface CacheEntry {
    result: CachedResult;
    expiresAt: number;
}

interface Failure {
    message: string;
    attempts: number;
    retryAt: number;
}

const UNKNOWN: HauntState = { kind: "unknown" };

const cache = new Map<string, CacheEntry>();
const failures = new Map<string, Failure>();
const listeners = new Map<string, Set<() => void>>();
const statusListeners = new Set<() => void>();

/** Discord ids waiting for a lookup, next one first. */
const pending: string[] = [];
const queued = new Set<string>();

let running = false;
let pumping = false;
let wake: (() => void) | undefined;

/** The key lookups use. Follows the setting once typing has settled, see `commitApiKey`. */
let apiKey = "";
/** Bumped with every key change, so an answer for the old key is not held against the new one. */
let keyEpoch = 0;
let keyProblem: (KeyProblem & { attempts: number; retryAt: number; }) | null = null;
let announcedKeyCode: string | null = null;

let lastRequestAt = 0;
let rateLimitedUntil = 0;
let outageUntil = 0;
let consecutiveErrors = 0;
let lastError: string | null = null;

let keyProblemHandler: ((problem: KeyProblem) => void) | undefined;
export function setKeyProblemHandler(handler: ((problem: KeyProblem) => void) | undefined) {
    keyProblemHandler = handler;
}

const backoff = (base: number, max: number, attempts: number) => Math.min(base * 2 ** Math.max(attempts - 1, 0), max);

// Persistence

function isCachedResult(value: unknown): value is CachedResult {
    if (typeof value !== "object" || value === null) return false;
    const result = value as Record<string, any>;

    switch (result.kind) {
        case "none":
            return true;
        case "status":
            return ["banned", "private", "unavailable"].includes(result.status) && typeof result.message === "string";
        case "ok":
            return typeof result.profile?.user?.username === "string"
                && typeof result.profile.user.id === "string"
                && Array.isArray(result.profile.badges);
        default:
            return false;
    }
}

let loading: Promise<void> | undefined;

export function loadPersistedCache() {
    return loading ??= readPersistedCache();
}

async function readPersistedCache() {
    try {
        await Promise.all(LEGACY_STORE_KEYS.map(key => DataStore.del(key)));
        if (!settings.store.persistCache) return;

        const stored = await DataStore.get<Record<string, CacheEntry>>(STORE_KEY);
        if (typeof stored !== "object" || stored === null) return;

        const now = Date.now();
        for (const [discordId, entry] of Object.entries(stored)) {
            if (cache.has(discordId) || !(entry?.expiresAt > now) || !isCachedResult(entry.result)) continue;
            cache.set(discordId, { result: entry.result, expiresAt: entry.expiresAt });
        }

        notifyAll();
    } catch (e) {
        logger.error("Failed to read the stored cache", e);
    }
}

const persist = debounce(async () => {
    if (!settings.store.persistCache) return;

    const now = Date.now();
    const alive = Object.fromEntries(
        [...cache].filter(([, entry]) => entry.expiresAt > now)
    );

    try {
        await DataStore.set(STORE_KEY, alive);
    } catch (e) {
        logger.error("Failed to write the cache", e);
    }
}, 2000);

export async function dropPersistedCache() {
    try {
        await DataStore.del(STORE_KEY);
    } catch (e) {
        logger.error("Failed to delete the stored cache", e);
    }
}

// Subscriptions

function notify(discordId: string) {
    listeners.get(discordId)?.forEach(listener => listener());
}

function notifyAll() {
    listeners.forEach(set => set.forEach(listener => listener()));
    notifyStatus();
}

function notifyStatus() {
    statusListeners.forEach(listener => listener());
}

export const refreshAll = notifyAll;

function subscribe(discordId: string, listener: () => void) {
    let set = listeners.get(discordId);
    if (!set) listeners.set(discordId, set = new Set());
    set.add(listener);

    return () => {
        set!.delete(listener);
        if (!set!.size) listeners.delete(discordId);
    };
}

// Cache

function prune() {
    const now = Date.now();

    for (const [discordId, failure] of failures) {
        if (failure.retryAt + USER_RETRY_MAX < now) failures.delete(discordId);
    }

    if (cache.size <= MAX_ENTRIES) return;

    for (const [discordId, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(discordId);
    }

    // A Map iterates in insertion order, so this drops the oldest answers.
    for (const discordId of cache.keys()) {
        if (cache.size <= MAX_ENTRIES * 0.9) break;
        cache.delete(discordId);
    }
}

function store(discordId: string, result: CachedResult, ttl: number) {
    // Re-insert, so the insertion order `prune` relies on is the order of the answers.
    cache.delete(discordId);
    cache.set(discordId, { result, expiresAt: Date.now() + ttl });
    failures.delete(discordId);

    prune();
    persist();
    notify(discordId);
}

const isFresh = (discordId: string) => (cache.get(discordId)?.expiresAt ?? 0) > Date.now();

function getState(discordId: string): HauntState {
    // A stale answer beats none: it stays on screen while it is fetched again, and when that fails.
    const hit = cache.get(discordId);
    if (hit) return hit.result;

    const failure = failures.get(discordId);
    if (failure) return { kind: "error", message: failure.message };

    return UNKNOWN;
}

// Queue

/** Sleeps until the time is up or `wake` is called, whichever comes first. */
function nap(ms: number) {
    return new Promise<void>(resolve => {
        const done = () => {
            clearTimeout(timer);
            if (wake === done) wake = undefined;
            resolve();
        };
        const timer = setTimeout(done, ms);
        wake = done;
    });
}

function dropPending() {
    pending.length = 0;
    queued.clear();
}

function enqueue(discordId: string, priority: boolean) {
    if (queued.has(discordId)) {
        if (!priority || pending[0] === discordId) return;
        pending.splice(pending.indexOf(discordId), 1);
        pending.unshift(discordId);
    } else {
        queued.add(discordId);
        if (priority) pending.unshift(discordId);
        else pending.push(discordId);
    }

    // A waiting queue re-reads what is next, so an opened profile is not stuck behind the pause it slept on.
    if (priority) wake?.();
    notifyStatus();
    void pump();
}

/** Whether a lookup for this user would be answered and is still worth its request. */
function isWanted(discordId: string) {
    if (isFresh(discordId)) return false;
    if ((failures.get(discordId)?.retryAt ?? 0) > Date.now()) return false;

    // Nobody is looking at them anymore (scrolled away, popout closed).
    return listeners.has(discordId);
}

function canLookup() {
    if (!running || !apiKey) return false;
    return !keyProblem || keyProblem.retryAt <= Date.now();
}

/**
 * Asks for a lookup of this user unless one is pointless right now.
 * `force` is for a profile somebody opened: it ignores the automatic lookup
 * setting and goes to the front of the queue.
 */
function ensure(discordId: string, force: boolean) {
    if (!force && !settings.store.autoLookup) return;
    if (!canLookup() || !isWanted(discordId)) return;

    enqueue(discordId, force);
}

async function pump() {
    if (pumping) return;
    pumping = true;

    try {
        await loadPersistedCache();

        while (pending.length) {
            if (!canLookup()) {
                dropPending();
                break;
            }

            const wait = Math.max(rateLimitedUntil, outageUntil, lastRequestAt + settings.store.requestDelayMs) - Date.now();
            if (wait > 0) {
                await nap(wait);
                continue;
            }

            const discordId = pending.shift()!;
            queued.delete(discordId);
            if (!isWanted(discordId)) continue;

            const epoch = keyEpoch;
            lastRequestAt = Date.now();
            const result = await lookupByDiscordId(apiKey, discordId);

            handleResult(discordId, result, epoch === keyEpoch);
        }
    } catch (e) {
        logger.error("The lookup queue stopped unexpectedly", e);
        dropPending();
    } finally {
        pumping = false;
        notifyStatus();
    }
}

function handleResult(discordId: string, result: LookupResult, sameKey: boolean) {
    switch (result.kind) {
        case "ok":
            succeeded(sameKey);
            store(discordId, { kind: "ok", profile: result.profile }, settings.store.cacheTtlMinutes * 60_000);
            break;

        case "none":
            succeeded(sameKey);
            store(discordId, { kind: "none" }, settings.store.negativeCacheHours * 60 * 60_000);
            break;

        // Kept only as long as a profile: a ban gets lifted, a profile goes public again.
        case "status":
            succeeded(sameKey);
            store(discordId, { kind: "status", status: result.status, message: result.message }, settings.store.cacheTtlMinutes * 60_000);
            break;

        case "key":
            // The key was changed while this was on its way: ask again with the new one.
            if (!sameKey) {
                enqueue(discordId, true);
                break;
            }

            keyProblem = {
                code: result.code,
                message: result.message,
                attempts: (keyProblem?.attempts ?? 0) + 1,
                retryAt: 0
            };
            keyProblem.retryAt = Date.now() + backoff(KEY_RETRY_BASE, KEY_RETRY_MAX, keyProblem.attempts);
            dropPending();
            logger.error(`Lookups stopped, the API key was refused: ${result.message} (${result.code})`);

            // Once per key and reason. The retries above stay silent.
            if (announcedKeyCode !== result.code) {
                announcedKeyCode = result.code;
                keyProblemHandler?.({ code: result.code, message: result.message });
            }
            notifyAll();
            break;

        case "ratelimited":
            rateLimitedUntil = Date.now() + result.retryAfterMs;
            logger.warn(`Rate limited, pausing lookups for ${Math.round(result.retryAfterMs / 1000)}s`);
            // Nothing was learned about this user, so they keep their place.
            enqueue(discordId, true);
            break;

        case "error": {
            const attempts = (failures.get(discordId)?.attempts ?? 0) + 1;
            failures.set(discordId, {
                message: result.message,
                attempts,
                retryAt: Date.now() + backoff(USER_RETRY_BASE, USER_RETRY_MAX, attempts)
            });

            lastError = result.message;
            consecutiveErrors++;
            if (consecutiveErrors >= OUTAGE_THRESHOLD) {
                const pause = backoff(OUTAGE_PAUSE_BASE, OUTAGE_PAUSE_MAX, consecutiveErrors - OUTAGE_THRESHOLD + 1);
                outageUntil = Date.now() + pause;
                logger.warn(`${consecutiveErrors} lookups failed in a row, pausing for ${Math.round(pause / 1000)}s. Last error: ${result.message}`);
            } else {
                logger.warn(`Lookup for ${discordId} failed: ${result.message}`);
            }

            notify(discordId);
            break;
        }
    }

    notifyStatus();
}

/** haunt.gg answered properly, so whatever was wrong before is over. */
function succeeded(sameKey: boolean) {
    consecutiveErrors = 0;
    outageUntil = 0;
    lastError = null;

    if (sameKey) {
        keyProblem = null;
        announcedKeyCode = null;
    }
}

// Control

/** Lets lookups run again after a key problem or an outage, e.g. once a key test went through. */
export function resumeLookups() {
    keyProblem = null;
    announcedKeyCode = null;
    consecutiveErrors = 0;
    outageUntil = 0;
    lastError = null;

    wake?.();
    notifyAll();
}

/**
 * Makes lookups use the key from the settings. Called on start and once typing
 * in the key field has settled, so a half-typed key is never sent.
 */
export function commitApiKey() {
    const next = settings.store.apiKey.trim();
    const usable = isPlausibleApiKey(next) ? next : "";
    if (usable === apiKey) return;

    apiKey = usable;
    keyEpoch++;
    rateLimitedUntil = 0;
    resumeLookups();
}

/** Asks for a user again right away, past their retry delay. For the retry button of a failed lookup. */
export function retryLookup(discordId: string) {
    failures.delete(discordId);
    outageUntil = 0;
    notify(discordId);
    ensure(discordId, true);
}

/** Feeds an answer that was fetched outside the queue (the key test) into the cache. */
export function rememberResult(discordId: string, result: LookupResult) {
    if (result.kind === "ok" || result.kind === "none" || result.kind === "status")
        handleResult(discordId, result, true);
}

export function clearCache() {
    cache.clear();
    failures.clear();
    void DataStore.del(STORE_KEY).catch(e => logger.error("Failed to clear the stored cache", e));
    resumeLookups();
}

export function startLookups() {
    running = true;
    commitApiKey();
    void loadPersistedCache();
}

export function stopLookups() {
    running = false;
    dropPending();
    wake?.();
}

// Hooks

export function useHauntState(discordId: string | undefined, force = false): HauntState {
    const [, rerender] = useState(0);

    useEffect(() => {
        if (!discordId) return;
        return subscribe(discordId, () => rerender(n => n + 1));
    }, [discordId]);

    // After every render, and after the subscription above: an expired entry is
    // refreshed as soon as anything re-renders, and the queue sees who is watching.
    useEffect(() => {
        if (discordId) ensure(discordId, force);
    });

    return discordId ? getState(discordId) : UNKNOWN;
}

export function getLookupStatus(): LookupStatus {
    const now = Date.now();

    return {
        cached: cache.size,
        queued: pending.length,
        keyProblem: keyProblem && { code: keyProblem.code, message: keyProblem.message },
        rateLimitedUntil: rateLimitedUntil > now ? rateLimitedUntil : 0,
        outageUntil: outageUntil > now ? outageUntil : 0,
        lastError
    };
}

export function useLookupStatus(): LookupStatus {
    const [, rerender] = useState(0);

    useEffect(() => {
        const listener = () => rerender(n => n + 1);
        statusListeners.add(listener);
        // Pauses end without an event, so the countdowns need a tick of their own.
        const interval = setInterval(listener, 1000);

        return () => {
            statusListeners.delete(listener);
            clearInterval(interval);
        };
    }, []);

    return getLookupStatus();
}
