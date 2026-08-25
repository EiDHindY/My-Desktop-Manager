import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { os } from 'os'; // Error: os is a module, not an importable object like this in some node versions, use require or import *
import * as os_mod from 'os';

const labelsDir = join(os_mod.homedir(), '.config', 'desktop-manager');
const labelsPath = join(labelsDir, 'labels.json');

export interface DesktopLabel {
    name: string;
    priority: string;
    icons?: string[];
    shortcut?: string;
}

export function getLabelCache(): Record<string, DesktopLabel> {
    if (!existsSync(labelsPath)) return {};
    try {
        const data = JSON.parse(readFileSync(labelsPath, 'utf-8'));
        // Migrate old 'icon' to 'icons' if found
        Object.keys(data).forEach(uuid => {
            if (data[uuid].icon && !data[uuid].icons) {
                data[uuid].icons = [data[uuid].icon];
                delete data[uuid].icon;
            }
        });
        return data;
    } catch (e) {
        return {};
    }
}

export function saveLabelCache(cache: Record<string, DesktopLabel>) {
    try {
        if (!existsSync(labelsDir)) {
            mkdirSync(labelsDir, { recursive: true });
        }
        writeFileSync(labelsPath, JSON.stringify(cache, null, 2));
    } catch (e) {
        console.error('Error saving label cache:', e);
    }
}

export function updateLabel(uuid: string, rawLabel: string) {
    const cache = getLabelCache();
    let name = rawLabel;
    let priority = "None";

    if (rawLabel.includes('|')) {
        const parts = rawLabel.split('|');
        name = parts[0];
        priority = parts[1];
    }

    const existing = cache[uuid] || { name: "", priority: "None" };
    if (existing.name === name && existing.priority === priority) {
        return; // Prevent race conditions rewriting the cache and erasing icons
    }
    cache[uuid] = { ...existing, name, priority };
    saveLabelCache(cache);
}

export function updateIcon(uuid: string, iconsStr: string | null) {
    const cache = getLabelCache();
    const existing = cache[uuid] || { name: "", priority: "None" };
    const icons = iconsStr ? iconsStr.split(',').filter(i => i.trim() !== '') : [];
    cache[uuid] = { ...existing, icons };
    saveLabelCache(cache);
}

export function updateShortcut(uuid: string, shortcut: string | null) {
    const cache = getLabelCache();
    const existing = cache[uuid] || { name: "", priority: "None" };
    if (shortcut) {
        cache[uuid] = { ...existing, shortcut };
    } else {
        delete existing.shortcut;
        cache[uuid] = existing;
    }
    saveLabelCache(cache);
}


export function removeLabel(uuid: string) {
    const cache = getLabelCache();
    delete cache[uuid];
    saveLabelCache(cache);
}
