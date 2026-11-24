/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Tooltip } from "@webpack/common";
import { CSSProperties } from "react";

import { ResolvedBadge } from "../badges";
import { cl } from "../utils";

interface Props {
    badges: ResolvedBadge[];
    size: number;
    max?: number;
}

/** An icon badge is a silhouette: its markup masks a square filled with the badge colour. */
function maskStyle(badge: ResolvedBadge, size: number): CSSProperties {
    const mask = `url("${badge.maskUrl}") center / contain no-repeat`;

    return {
        width: size,
        height: size,
        mask,
        WebkitMask: mask,
        ...(badge.color ? { backgroundColor: badge.color } : null)
    };
}

export function HauntBadgeRow({ badges, size, max }: Props) {
    if (!badges.length) return null;

    const shown = max != null && max < badges.length ? badges.slice(0, max) : badges;
    const hidden = badges.length - shown.length;

    return (
        <span className={cl("badges")}>
            {shown.map(badge => (
                <Tooltip
                    key={badge.key}
                    text={
                        <span className={cl("badge-tooltip")}>
                            <span className={cl("badge-tooltip-name")} style={badge.color ? { color: badge.color } : undefined}>
                                {badge.name}
                            </span>
                            {badge.description && <span className={cl("badge-tooltip-description")}>{badge.description}</span>}
                        </span>
                    }
                >
                    {tooltipProps => badge.imageUrl != null
                        ? (
                            <img
                                {...tooltipProps}
                                className={cl("badge")}
                                src={badge.imageUrl}
                                alt={badge.name}
                                style={{ width: size, height: size }}
                                // An image that cannot load (blocked until Discord restarts, deleted upload) leaves no broken icon behind.
                                onError={e => { e.currentTarget.style.display = "none"; }}
                            />
                        )
                        : (
                            <span
                                {...tooltipProps}
                                className={cl("badge", "badge-icon")}
                                role="img"
                                aria-label={badge.name}
                                style={maskStyle(badge, size)}
                            />
                        )}
                </Tooltip>
            ))}

            {hidden > 0 && (
                <Tooltip text={badges.slice(shown.length).map(badge => badge.name).join(", ")}>
                    {tooltipProps => (
                        <span {...tooltipProps} className={cl("badge-overflow")}>+{hidden}</span>
                    )}
                </Tooltip>
            )}
        </span>
    );
}
