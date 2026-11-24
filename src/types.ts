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

export interface HauntBadgeCatalog {
    title: string;
    description: string;
    color: string;
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
    /** The official name, description and colour of the tier the artwork shows. `null` for custom badges. */
    catalog?: HauntBadgeCatalog | null;
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

/** A successful `GET /api/lookup/user` body. A failure is `{ error, code }` plus the fields its code documents. */
export interface HauntLookupResponse {
    user: HauntUser;
    badges?: HauntBadge[];
    views?: number;
    feedback?: HauntFeedback;
}

/**
 * An account that exists but that the API refuses to hand out:
 * banned (`USER_BANNED`), opted out of the public API (`PROFILE_PRIVATE`), or
 * disabled / scheduled for deletion by its owner (`USER_UNAVAILABLE`).
 */
export type HauntAccountStatus = "banned" | "private" | "unavailable";

/** Who a banned account is. The API names nobody for a private or disabled one. */
export interface HauntStatusUser {
    username: string;
    uid: number;
}

/** Why an account is `unavailable`, where the API says so. */
export type HauntUnavailableReason = "disabled" | "pending-deletion";

/** The optional parts of a profile. Each one costs haunt.gg a query, so only what is shown gets asked for. */
export const LOOKUP_INCLUDES = ["badges", "views", "feedback"] as const;
export type LookupInclude = typeof LOOKUP_INCLUDES[number];

export const LOOKUP_TYPES = ["discord", "username", "uid", "id"] as const;
export type LookupType = typeof LOOKUP_TYPES[number];

/** Who a lookup is about: `type` says how to read `value`. */
export interface LookupTarget {
    type: LookupType;
    value: string;
}

/** What the transport hands back: the raw answer, or `status: 0` when no answer arrived. */
export interface RawLookupResponse {
    status: number;
    retryAfter: string | null;
    data: string;
}
