/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { Span } from "@components/Span";
import { showToast, UserStore, useState } from "@webpack/common";

import { settings } from "..";
import { isPlausibleApiKey, logger, lookupByDiscordId } from "../api";
import { clearCache, commitApiKey, rememberResult, resumeLookups, useLookupStatus } from "../cache";
import { cl } from "../utils";

const secondsUntil = (timestamp: number) => Math.max(1, Math.ceil((timestamp - Date.now()) / 1000));

/** One line on what the lookups are doing right now, so a silent plugin explains itself. */
function StatusLine({ apiKey }: { apiKey: string; }) {
    const status = useLookupStatus();

    let text: string;
    let problem = true;

    if (!apiKey) {
        text = "No API key set, nothing is looked up.";
    } else if (!isPlausibleApiKey(apiKey)) {
        text = "This does not look like a haunt.gg API key. Keys start with haunt_ and contain no spaces.";
    } else if (status.keyProblem) {
        text = `Lookups are stopped: ${status.keyProblem.message} (${status.keyProblem.code}).`;
    } else if (status.rateLimitedUntil) {
        text = `Rate limited by haunt.gg, continuing in ${secondsUntil(status.rateLimitedUntil)}s. ${status.queued} waiting.`;
    } else if (status.outageUntil) {
        text = `haunt.gg is not answering${status.lastError ? ` (${status.lastError})` : ""}. Trying again in ${secondsUntil(status.outageUntil)}s.`;
    } else {
        problem = false;
        text = `Running. ${status.cached} cached, ${status.queued} waiting.`;
    }

    return <Span size="sm" className={cl("settings-status", { "settings-status-problem": problem })}>{text}</Span>;
}

export function HauntSettings() {
    const { apiKey: rawApiKey } = settings.use(["apiKey"]);
    const apiKey = rawApiKey.trim();
    const [testing, setTesting] = useState(false);

    async function testKey() {
        const discordId = UserStore.getCurrentUser()?.id;
        if (!discordId) return;

        setTesting(true);
        try {
            const result = await lookupByDiscordId(apiKey, discordId);

            switch (result.kind) {
                case "ok":
                    showToast({ text: `Key works — you are ${result.profile.user.username} (#${result.profile.user.uid})`, variant: "success" });
                    break;
                case "none":
                    showToast({ text: "Key works, but no haunt.gg account is linked to your Discord", variant: "default" });
                    break;
                // The key did its job: the API looked you up and said why it shows nothing.
                case "status":
                    showToast({ text: `Key works. About your own account, haunt.gg says: ${result.message}`, variant: "default" });
                    break;
                case "key":
                    showToast({ text: `Key rejected: ${result.message}`, variant: "critical" });
                    break;
                case "ratelimited":
                    showToast({ text: `Rate limited — try again in ${Math.ceil(result.retryAfterMs / 1000)}s`, variant: "critical" });
                    break;
                case "error":
                    showToast({ text: `Lookup failed: ${result.message}`, variant: "critical" });
                    break;
            }

            if (result.kind === "ok" || result.kind === "none" || result.kind === "status") {
                // The key is good: use it right away, and drop whatever stopped the lookups before.
                commitApiKey();
                resumeLookups();
                rememberResult(discordId, result);
            }
        } catch (e) {
            logger.error("Key test failed", e);
            showToast({ text: "Lookup failed — see the console", variant: "critical" });
        } finally {
            setTesting(false);
        }
    }

    return (
        <div className={cl("settings")}>
            <Span size="sm">
                Get a key with the <code>lookup:user</code> permission from your haunt.gg dashboard.
                Badge artwork only loads after a full restart of Discord, since the image host is
                whitelisted when the app starts.
            </Span>

            <StatusLine apiKey={apiKey} />

            <Flex style={{ gap: "0.5em" }}>
                <Button size="small" disabled={!isPlausibleApiKey(apiKey) || testing} onClick={testKey}>
                    {testing ? "Testing…" : "Test key"}
                </Button>
                <Button
                    size="small"
                    variant="secondary"
                    onClick={() => {
                        clearCache();
                        showToast({ text: "Cleared the Haunt cache", variant: "success" });
                    }}
                >
                    Clear cache
                </Button>
            </Flex>
        </div>
    );
}
