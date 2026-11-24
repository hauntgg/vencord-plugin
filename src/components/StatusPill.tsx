/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Tooltip } from "@webpack/common";

import { HauntAccountStatus, HauntUnavailableReason } from "../types";
import { cl } from "../utils";

export type PillKind = HauntAccountStatus | HauntUnavailableReason | "inactive";

const LABELS: Record<PillKind, string> = {
    banned: "Banned",
    private: "Private",
    unavailable: "Unavailable",
    disabled: "Disabled",
    "pending-deletion": "Pending deletion",
    inactive: "Inactive"
};

/** The pill of an account status: the reason where the API gives one, the status itself otherwise. */
export function statusPillKind(state: { status: HauntAccountStatus; reason?: HauntUnavailableReason; }): PillKind {
    return state.status === "unavailable" && state.reason ? state.reason : state.status;
}

interface Props {
    kind: PillKind;
    /** Shown on hover. For an account status this is the sentence the API answered with. */
    tooltip?: string;
}

export function StatusPill({ kind, tooltip }: Props) {
    const pill = (props?: object) => (
        <span {...props} className={cl("status", `status-${kind}`)}>{LABELS[kind]}</span>
    );

    return tooltip
        ? <Tooltip text={tooltip}>{tooltipProps => pill(tooltipProps)}</Tooltip>
        : pill();
}
