/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { copyWithToast } from "@utils/discord";
import { User } from "@vencord/discord-types";
import { Menu, showToast } from "@webpack/common";

import { settings } from ".";
import { getLookupStatus, HauntState, peekState, reloadLookup } from "./cache";
import { openProfile } from "./utils";

/** One line on what a reload found, for the toast that follows it. */
function describe(state: HauntState): { text: string; variant: "success" | "default" | "critical"; } {
    switch (state.kind) {
        case "ok":
            return { text: `Haunt: ${state.profile.user.username} (#${state.profile.user.uid})`, variant: "success" };
        case "none":
            return { text: "Haunt: no haunt.gg account is linked to this Discord account", variant: "default" };
        case "status":
            return { text: `Haunt: ${state.message}`, variant: "default" };
        case "error":
            return { text: `Haunt: the lookup failed — ${state.message}`, variant: "critical" };
        case "unknown": {
            const { keyProblem } = getLookupStatus();
            return { text: `Haunt: ${keyProblem ? keyProblem.message : "the lookup did not finish"}`, variant: "critical" };
        }
    }
}

async function reloadAndReport(discordId: string) {
    const reload = reloadLookup(discordId);
    if (!reload) {
        const { keyProblem } = getLookupStatus();
        showToast({
            text: `Haunt: ${keyProblem ? keyProblem.message : "no usable API key is set"}. Check the key in the plugin settings.`,
            variant: "critical"
        });
        return;
    }

    showToast(describe(await reload));
}

export const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!settings.store.showContextMenu || !user?.id || user.bot) return;

    const state = peekState(user.id);
    // Who the account is, where that is known: a normal profile, or a banned one the API names.
    const account = state.kind === "ok" ? state.profile.user : state.kind === "status" ? state.user : undefined;
    const known = state.kind === "ok" || state.kind === "status" || state.kind === "none";

    children.push(
        <Menu.MenuItem id="vc-haunt" label="Haunt">
            {account && (
                <Menu.MenuItem
                    id="vc-haunt-open"
                    label={`Open haunt.gg/${account.username}`}
                    action={() => openProfile(account.username)}
                />
            )}
            {account && (
                <Menu.MenuItem
                    id="vc-haunt-copy-uid"
                    label={`Copy UID #${account.uid}`}
                    action={() => copyWithToast(String(account.uid), "Copied the Haunt UID")}
                />
            )}
            <Menu.MenuItem
                id="vc-haunt-reload"
                label={known ? "Reload from haunt.gg" : "Look up on haunt.gg"}
                action={() => void reloadAndReport(user.id)}
            />
        </Menu.MenuItem>
    );
};
