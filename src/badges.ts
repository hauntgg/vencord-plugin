/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BADGE_CATALOG, BADGE_TIER_CATALOG } from "./badgeCatalog";
import { HauntBadge } from "./types";

export interface ResolvedBadge {
    key: string;
    name: string;
    description: string | null;
    imageUrl: string | null;
    /** A `data:` URL of the badge's icon, to be painted as a mask in `color`. Set when there is no image. */
    maskUrl: string | null;
    color: string | null;
}

/** The API caps icon markup at 20,000 characters. Anything far beyond that is not an icon. */
const ICON_SVG_MAX = 40_000;

function prettifyId(badgeId: string) {
    return badgeId.split(/[-_]/).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/**
 * The tier a badge shows: the one its owner picked, else the highest unlocked.
 * This is how the API picks `imageUrl`, so name and artwork stay in step.
 */
function effectiveTier(badge: HauntBadge) {
    if (badge.selectedTier != null) return badge.selectedTier;
    return badge.unlockedTiers.length ? Math.max(...badge.unlockedTiers) : null;
}

function iconMaskUrl(iconSvg: string | null | undefined) {
    if (typeof iconSvg !== "string" || !iconSvg.trimStart().startsWith("<svg") || iconSvg.length > ICON_SVG_MAX) return null;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg)}`;
}

function resolveBadge(badge: HauntBadge): ResolvedBadge {
    const tierNumber = effectiveTier(badge);

    const catalog = badge.badgeId ? BADGE_CATALOG[badge.badgeId] : undefined;
    const tier = badge.badgeId != null && tierNumber != null
        ? BADGE_TIER_CATALOG[badge.badgeId]?.[tierNumber]
        : undefined;

    const official = tier ?? catalog;
    const apiTier = tierNumber != null
        ? badge.tiers.find(t => t.tier === tierNumber)
        : undefined;

    const name = official?.title
        ?? (badge.name?.trim() || undefined)
        ?? apiTier?.title
        ?? (badge.badgeId ? prettifyId(badge.badgeId) : "Badge");

    const imageUrl = badge.imageUrl ?? badge.image?.url ?? null;

    return {
        key: badge.id,
        name: name || "Badge",
        description: official?.description ?? apiTier?.description ?? null,
        imageUrl,
        maskUrl: imageUrl == null ? iconMaskUrl(badge.iconSvg) : null,
        color: official?.color ?? apiTier?.color ?? badge.color ?? null
    };
}

export function listBadges(badges: HauntBadge[], onlyEnabled: boolean): ResolvedBadge[] {
    return badges
        .filter(badge => !onlyEnabled || badge.enabled)
        .sort((a, b) => a.order - b.order)
        .map(resolveBadge)
        .filter(badge => badge.imageUrl != null || badge.maskUrl != null);
}
