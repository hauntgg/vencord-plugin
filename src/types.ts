/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface HauntAsset {
    url: string;
    mime: string;
    width: number | null;
    height: number | null;
    duration: number | null;
}

export interface HauntBadgeTier {
    tier: number;
    threshold: number;
    title: string;
    description: string;
    color: string | null;
    unlocked: boolean;
    selected: boolean;
    imageUrl: string | null;
}

export interface HauntBadge {
    id: string;
    type: "STANDARD" | "CUSTOM";
    badgeId: string | null;
    enabled: boolean;
    selectedTier: number | null;
    unlockedTiers: number[];
    color: string | null;
    recolor: boolean;
    name: string | null;
    order: number;
    image: HauntAsset | null;
    imageUrl: string | null;
    /** Iconify markup of a custom badge that uses an icon instead of an upload. */
    iconSvg?: string | null;
    tiers: HauntBadgeTier[];
}

export interface HauntUser {
    id: string;
    uid: number;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    discordId: string | null;
    lastfmUsername?: string | null;
    premium: boolean;
    verified: boolean;
    imagehost: boolean;
    inactive: boolean;
    createdAt: string;
}

export interface HauntFeedback {
    likes: number;
    dislikes: number;
}

export interface HauntProfile {
    user: HauntUser;
    badges: HauntBadge[];
    views: number | null;
    feedback: HauntFeedback | null;
}

/** A successful `GET /api/lookup/user` body. Failures are a `HauntErrorBody`. */
export interface HauntLookupResponse {
    user: HauntUser;
    badges?: HauntBadge[];
    views?: number;
    feedback?: HauntFeedback;
}

/**
 * Every failed response of the haunt.gg API. `code` is the stable identifier,
 * `error` an English sentence whose wording may change.
 */
export interface HauntErrorBody {
    error: string;
    code?: string;
    param?: string;
}

/**
 * An account that exists but that the API refuses to hand out:
 * banned (`USER_BANNED`), opted out of the public API (`PROFILE_PRIVATE`), or
 * disabled / scheduled for deletion by its owner (`USER_UNAVAILABLE`).
 */
export type HauntAccountStatus = "banned" | "private" | "unavailable";

/** What the transport hands back: the raw answer, or `status: 0` when no answer arrived. */
export interface RawLookupResponse {
    status: number;
    retryAfter: string | null;
    data: string;
}
