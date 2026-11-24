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
import { StatusPill, statusPillKind } from "./StatusPill";

export function ChatDecoration({ userId }: { userId: string; }) {
    const {
        chatShowUsername, chatShowUid, chatShowBadges, chatShowStatus, chatSeparator,
        chatMaxBadges, chatBadgeSize, chatClickOpensProfile, badgesOnlyEnabled
    } = settings.store;

    const state = useHauntState(userId);

    if (state.kind !== "ok" && state.kind !== "status") return null;
    if (state.kind === "status" && !chatShowStatus) return null;

    // A banned account is named by the API, a private or disabled one is not: only that it exists, and why it is hidden.
    const user = state.kind === "ok" ? state.profile.user : state.user;
    const badges = state.kind === "ok" && chatShowBadges ? listBadges(state.profile.badges, badgesOnlyEnabled) : [];

    const name = user
        ? [
            chatShowUsername && <span key="name" className={cl("chat-username")}>{user.username}</span>,
            chatShowUid && <span key="uid" className={cl("chat-uid")}>#{user.uid}</span>
        ].filter(Boolean)
        : [];

    if (state.kind === "status") {
        return (
            <span className={cl("chat")}>
                {chatSeparator && <span className={cl("chat-separator")}>{chatSeparator}</span>}

                {user && name.length > 0
                    ? (
                        <ProfileLink username={user.username} enabled={chatClickOpensProfile} className={cl("chat-name")}>
                            {name}
                        </ProfileLink>
                    )
                    : <span className={cl("chat-site")}>haunt.gg</span>}

                <StatusPill kind={statusPillKind(state)} tooltip={state.message} />
            </span>
        );
    }

    if (!user) return null;

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
