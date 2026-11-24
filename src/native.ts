/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CspPolicies, ImageSrc } from "@main/csp";
import { IpcMainInvokeEvent } from "electron";

import { requestLookup } from "./request";
import { LookupInclude, LookupTarget } from "./types";

// Catalog badge art, uploads, and the avatar route profiles that mirror their
// Discord avatar point at (`haunt.gg/api/discord/avatar/<id>`).
CspPolicies["assets.haunt.gg"] = ImageSrc;
CspPolicies["r2.haunt.gg"] = ImageSrc;
CspPolicies["haunt.gg"] = ImageSrc;

export function lookupUser(_: IpcMainInvokeEvent, apiKey: string, target: LookupTarget, includes: LookupInclude[]) {
    return requestLookup(apiKey, target, includes);
}
