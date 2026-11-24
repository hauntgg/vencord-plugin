/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage, VencordCommand } from "@api/Commands";

import { settings } from ".";
import { isPlausibleApiKey, lookup, LookupResult } from "./api";
import { listBadges } from "./badges";
import { rememberResult } from "./cache";
import { DISCORD_ID_PATTERN } from "./request";
import { LOOKUP_INCLUDES, LOOKUP_TYPES, LookupTarget, LookupType } from "./types";
import { formatDate, formatNumber, profileUrl } from "./utils";

/** Badge names listed before the rest is summed up as "+n more". */
const BADGES_SHOWN = 12;

const isLookupType = (value: string): value is LookupType => (LOOKUP_TYPES as readonly string[]).includes(value);

/**
 * Reads what was typed: `#12` or plain digits are a UID, 17 to 20 digits or a
 * mention a Discord ID, a haunt.gg link or anything else a username.
 */
export function parseQuery(raw: string, by?: string): LookupTarget | null {
    const query = raw.trim();
    if (!query) return null;

    if (by && isLookupType(by)) return { type: by, value: query.replace(/^[#@]/, "") };

    const mention = /^<@!?(\d{17,20})>$/.exec(query);
    if (mention) return { type: "discord", value: mention[1] };
    if (DISCORD_ID_PATTERN.test(query)) return { type: "discord", value: query };
    if (/^#?\d+$/.test(query)) return { type: "uid", value: query.replace("#", "") };

    const link = /^(?:https?:\/\/)?(?:www\.)?haunt\.gg\/([^/?#\s]+)/i.exec(query);
    return { type: "username", value: link ? decodeURIComponent(link[1]) : query.replace(/^@/, "") };
}

/** Text somebody else typed or named themselves, made safe to sit inside a message. */
const plain = (text: string) => text.replace(/[\\`*_~|<>@#[\]()]/g, "\\$&");

function describe(result: LookupResult, target: LookupTarget): string {
    switch (result.kind) {
        case "ok": {
            const { user, badges, views, feedback } = result.profile;
            const flags = [user.premium && "Premium", user.verified && "Verified", user.imagehost && "Image Host", user.inactive && "Inactive"].filter(Boolean);
            const names = listBadges(badges, false).map(badge => badge.name);
            const joined = formatDate(user.createdAt);

            const stats = [
                views != null && `Views: ${formatNumber(views)}`,
                feedback && `Feedback: ${formatNumber(feedback.likes)} 👍 · ${formatNumber(feedback.dislikes)} 👎`,
                joined && `Joined: ${joined}`
            ].filter(Boolean);

            return [
                `**${plain(user.username)}** · UID #${user.uid} · <${profileUrl(user.username)}>`,
                user.discordId ? `Discord: <@${user.discordId}> (\`${user.discordId}\`)` : "Discord: not linked",
                stats.join(" · "),
                flags.length > 0 && `Account: ${flags.join(", ")}`,
                names.length > 0 && `Badges: ${names.slice(0, BADGES_SHOWN).map(plain).join(", ")}${names.length > BADGES_SHOWN ? ` +${names.length - BADGES_SHOWN} more` : ""}`,
                `ID: \`${user.id}\``
            ].filter(Boolean).join("\n");
        }

        case "none":
            return `No haunt.gg account found for ${target.type} \`${target.value.replaceAll("`", "")}\`.`;

        case "status":
            return result.user
                ? `**${plain(result.user.username)}** · UID #${result.user.uid} · <${profileUrl(result.user.username)}>\nhaunt.gg says: ${plain(result.message)}`
                : `haunt.gg says: ${plain(result.message)}`;

        case "key":
            return `The API key was refused: ${result.message}. Check it in the plugin settings.`;

        case "ratelimited":
            return `Rate limited by haunt.gg. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s.`;

        case "error":
            return `The lookup failed: ${plain(result.message)}`;
    }
}

export const hauntCommand: VencordCommand = {
    name: "haunt",
    description: "Look up a haunt.gg account and the Discord account behind it",
    inputType: ApplicationCommandInputType.BUILT_IN,
    options: [
        {
            name: "query",
            description: "A haunt.gg username, a UID like #1337, a haunt.gg link or a Discord user ID",
            type: ApplicationCommandOptionType.STRING,
            required: false
        },
        {
            name: "user",
            description: "A Discord user, instead of a query",
            type: ApplicationCommandOptionType.USER,
            required: false
        },
        {
            name: "by",
            description: "How to read the query. Leave it out and it is worked out from what you typed",
            type: ApplicationCommandOptionType.STRING,
            required: false,
            choices: [
                { name: "username", label: "username", value: "username" },
                { name: "uid", label: "uid", value: "uid" },
                { name: "discord", label: "discord", value: "discord" },
                { name: "id", label: "id", value: "id" }
            ]
        }
    ],

    execute: async (args, ctx) => {
        const reply = (content: string) => { sendBotMessage(ctx.channel.id, { content }); };

        const userId = findOption<string>(args, "user");
        const target = userId
            ? { type: "discord" as const, value: userId }
            : parseQuery(findOption<string>(args, "query", ""), findOption<string>(args, "by"));

        if (!target) return reply("Give a `query` (username, UID, link or Discord ID) or pick a `user`.");

        const apiKey = settings.store.apiKey.trim();
        if (!isPlausibleApiKey(apiKey)) return reply("Set a haunt.gg API key in the plugin settings first.");

        // Asked for by hand, so everything the answer shows is fetched, whatever the display settings say.
        const result = await lookup(apiKey, target, LOOKUP_INCLUDES);

        // Worth remembering wherever the Discord account is known: chat and profile then need no request of their own.
        const discordId = target.type === "discord" ? target.value : result.kind === "ok" ? result.profile.user.discordId : null;
        if (discordId) rememberResult(discordId, result);

        reply(describe(result, target));
    }
};
