/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { Span } from "@components/Span";
import { showToast, UserStore,useState } from "@webpack/common";

import { settings } from "..";
import { logger, lookupByDiscordId } from "../api";
import { clearCache } from "../cache";
import { cl } from "../utils";

export function HauntSettings() {
    const { apiKey } = settings.use(["apiKey"]);
    const [testing, setTesting] = useState(false);

    async function testKey() {
        const discordId = UserStore.getCurrentUser()?.id;
        if (!discordId) return;

        setTesting(true);
        try {
            const result = await lookupByDiscordId(apiKey.trim(), discordId);

            switch (result.kind) {
                case "ok":
                    showToast({ text: `Key works — you are ${result.profile.user.username} (#${result.profile.user.uid})`, variant: "success" });
                    break;
                case "none":
                    showToast({
                        text: result.reason === "private"
                            ? "Key works, but your profile has public API access switched off"
                            : "Key works, but no haunt.gg account is linked to your Discord",
                        variant: "default"
                    });
                    break;
                case "unauthorized":
                    showToast({ text: `Key rejected: ${result.message}`, variant: "critical" });
                    break;
                case "ratelimited":
                    showToast({ text: "Rate limited — try again in a minute", variant: "critical" });
                    break;
                case "error":
                    showToast({ text: `Lookup failed: ${result.message}`, variant: "critical" });
                    break;
            }

            if (result.kind !== "error") clearCache();
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

            <Flex style={{ gap: "0.5em" }}>
                <Button size="small" disabled={!apiKey.trim() || testing} onClick={testKey}>
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
