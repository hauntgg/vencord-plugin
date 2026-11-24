/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { OpenExternalIcon } from "@components/Icons";
import { Span } from "@components/Span";
import { copyWithToast } from "@utils/discord";
import { classes } from "@utils/misc";
import { findCssClassesLazy } from "@webpack";
import { ReactNode } from "react";

import { settings } from "..";
import { listBadges } from "../badges";
import { reloadLookup, useHauntState } from "../cache";
import { HauntProfile, HauntStatusUser } from "../types";
import { cl, formatDate, formatNumber } from "../utils";
import { HauntBadgeRow } from "./HauntBadgeRow";
import { ProfileLink } from "./ProfileLink";
import { StatusPill, statusPillKind } from "./StatusPill";

const ProfileCardClasses = findCssClassesLazy("cardsList", "card", "container");

function Card({ children }: { children: ReactNode; }) {
    return (
        <section className={ProfileCardClasses.container}>
            <div className={classes(ProfileCardClasses.card, cl("profile"))}>
                {children}
            </div>
        </section>
    );
}

function Field({ label, value, onClick, title }: { label: string; value: string; onClick?: () => void; title?: string; }) {
    return (
        <div className={cl("field")}>
            <Span className={cl("field-label")} size="xs" weight="medium">{label}</Span>
            {onClick
                ? <button className={classes(cl("field-value"), cl("field-copy"))} onClick={onClick} title={title}>{value}</button>
                : <Span className={cl("field-value")} size="sm">{value}</Span>}
        </div>
    );
}

/**
 * The card of an account there is no profile for: who or what it is about on
 * the left (the user where the API names one), a pill or action on the right.
 */
function NoticeCard({ user, aside, children }: { user?: HauntStatusUser | undefined; aside: ReactNode; children: ReactNode; }) {
    const { profileShowUsername, profileShowUid } = settings.store;

    return (
        <Card>
            <div className={cl("profile-notice-header")}>
                {user && (profileShowUsername || profileShowUid)
                    ? (
                        <ProfileLink username={user.username} className={cl("profile-notice-user")}>
                            {profileShowUsername && <Span size="sm" weight="semibold">{user.username}</Span>}
                            {profileShowUid && <Span className={cl("profile-displayname")} size="sm">#{user.uid}</Span>}
                        </ProfileLink>
                    )
                    : <Span size="sm" weight="semibold">haunt.gg</Span>}
                {aside}
            </div>
            <Span className={cl("profile-notice-text")} size="sm">{children}</Span>
        </Card>
    );
}

function ProfileCard({ profile }: { profile: HauntProfile; }) {
    const {
        badgesOnlyEnabled,
        profileShowUsername, profileShowUid, profileShowId, profileShowBadges, profileShowStatus,
        profileShowViews, profileShowFeedback, profileShowCreatedAt,
        profileBadgeSize
    } = settings.store;

    const { user, feedback, views } = profile;
    const badges = profileShowBadges ? listBadges(profile.badges, badgesOnlyEnabled) : [];
    const joined = formatDate(user.createdAt);

    return (
        <Card>
            <div className={cl("profile-top")}>
                <ProfileLink username={user.username} className={cl("profile-header")}>
                    {user.avatarUrl && (
                        <img
                            className={cl("profile-avatar")}
                            src={user.avatarUrl}
                            alt=""
                            onError={e => { e.currentTarget.style.display = "none"; }}
                        />
                    )}
                    <span className={cl("profile-names")}>
                        {profileShowUsername && <Span size="sm" weight="semibold">{user.username}</Span>}
                        {user.name && user.name !== user.username && (
                            <Span className={cl("profile-displayname")} size="xs">{user.name}</Span>
                        )}
                    </span>
                    <OpenExternalIcon width={14} height={14} className={cl("profile-external")} />
                </ProfileLink>

                {profileShowStatus && user.inactive && (
                    <StatusPill kind="inactive" tooltip="No activity on haunt.gg for over a year" />
                )}
            </div>

            {badges.length > 0 && (
                <div className={cl("profile-badges")}>
                    <HauntBadgeRow badges={badges} size={profileBadgeSize} />
                </div>
            )}

            <div className={cl("fields")}>
                {profileShowUid && <Field label="UID" value={`#${user.uid}`} />}
                {profileShowId && (
                    <Field
                        label="ID"
                        value={user.id}
                        title="Click to copy"
                        onClick={() => copyWithToast(user.id, "Copied the Haunt ID")}
                    />
                )}
                {profileShowViews && views != null && <Field label="Views" value={formatNumber(views)} />}
                {profileShowFeedback && feedback && (
                    <Field label="Feedback" value={`${formatNumber(feedback.likes)} 👍 · ${formatNumber(feedback.dislikes)} 👎`} />
                )}
                {profileShowCreatedAt && joined && <Field label="Joined" value={joined} />}
            </div>
        </Card>
    );
}

export function ProfileSection({ userId }: { userId: string; }) {
    const { showInProfile, profileShowStatus } = settings.store;

    const state = useHauntState(showInProfile ? userId : undefined, true);
    if (!showInProfile) return null;

    switch (state.kind) {
        case "ok":
            return <ProfileCard profile={state.profile} />;

        // The account exists, but the API names no user for it, only the reason.
        case "status":
            return profileShowStatus
                ? <NoticeCard user={state.user} aside={<StatusPill kind={statusPillKind(state)} />}>{state.message}</NoticeCard>
                : null;

        // Without this an opened profile could not tell "no account" from "could not ask".
        case "error":
            return (
                <NoticeCard
                    aside={
                        <button className={cl("profile-retry")} onClick={() => void reloadLookup(userId)}>
                            Try again
                        </button>
                    }
                >
                    <span className={cl("profile-notice-muted")} title={state.message}>The lookup failed.</span>
                </NoticeCard>
            );

        default:
            return null;
    }
}
