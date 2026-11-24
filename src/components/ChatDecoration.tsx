/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "..";
import { listBadges } from "../badges";
import { useHauntState } from "../cache";
import { cl } from "../utils";
import { HauntBadgeRow } from "./HauntBadgeRow";
import { ProfileLink } from "./ProfileLink";
import { StatusPill } from "./StatusPill";

export function ChatDecoration({ userId }: { userId: string; }) {
    const {
        chatShowUsername, chatShowUid, chatShowBadges, chatShowStatus, chatSeparator,
        chatMaxBadges, chatBadgeSize, chatClickOpensProfile, badgesOnlyEnabled
    } = settings.store;

    const state = useHauntState(userId);

    // The API hands out no name for these accounts, only that they exist and why they are hidden.
    if (state.kind === "status") {
        if (!chatShowStatus) return null;

        return (
            <span className={cl("chat")}>
                {chatSeparator && <span className={cl("chat-separator")}>{chatSeparator}</span>}
                <span className={cl("chat-site")}>haunt.gg</span>
                <StatusPill kind={state.status} tooltip={state.message} />
            </span>
        );
    }

    if (state.kind !== "ok") return null;

    const { user } = state.profile;
    const badges = chatShowBadges ? listBadges(state.profile.badges, badgesOnlyEnabled) : [];

    const name = [
        chatShowUsername && <span key="name" className={cl("chat-username")}>{user.username}</span>,
        chatShowUid && <span key="uid" className={cl("chat-uid")}>#{user.uid}</span>
    ].filter(Boolean);

    if (!name.length && !badges.length) return null;

    return (
        <span className={cl("chat")}>
            {chatSeparator && <span className={cl("chat-separator")}>{chatSeparator}</span>}

            {name.length > 0 && (
                <ProfileLink username={user.username} enabled={chatClickOpensProfile} className={cl("chat-name")}>
                    {name}
                </ProfileLink>
            )}

            {badges.length > 0 && <HauntBadgeRow badges={badges} size={chatBadgeSize} max={chatMaxBadges} />}
        </span>
    );
}
