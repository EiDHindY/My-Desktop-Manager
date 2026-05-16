import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { os } from 'os'; // Error: os is a module, not an importable object like this in some node versions, use require or import *
import * as os_mod from 'os';

const labelsDir = join(os_mod.homedir(), '.config', 'desktop-manager');
const labelsPath = join(labelsDir, 'labels.json');

export interface DesktopLabel {
    name: string;
    priority: string;
}

export function getLabelCache(): Record<string, DesktopLabel> {
    if (!existsSync(labelsPath)) return {};
    try {
        return JSON.parse(readFileSync(labelsPath, 'utf-8'));
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
    cache[uuid] = { ...existing, name, priority };
    saveLabelCache(cache);
}


export function removeLabel(uuid: string) {
    const cache = getLabelCache();
    delete cache[uuid];
    saveLabelCache(cache);
}
