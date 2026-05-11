"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChangeDetector = void 0;
const crypto_1 = require("crypto");
class ChangeDetector {
    hash(data) {
        return (0, crypto_1.createHash)('md5').update(JSON.stringify(data)).digest('hex');
    }
    detect(oldSnapshot, newSnapshot) {
        const changes = [];
        const oldHash = this.hash(oldSnapshot);
        const newHash = this.hash(newSnapshot);
        if (oldHash === newHash) {
            return { hasChanges: false, changes: [], isNew: false };
        }
        const allKeys = new Set([...Object.keys(oldSnapshot), ...Object.keys(newSnapshot)]);
        const skipKeys = new Set(['updatedAt', 'lastSeen', 'rawHtml']);
        for (const key of allKeys) {
            if (skipKeys.has(key))
                continue;
            const oldVal = oldSnapshot[key];
            const newVal = newSnapshot[key];
            const oldStr = JSON.stringify(oldVal);
            const newStr = JSON.stringify(newVal);
            if (oldStr !== newStr) {
                let changeType = 'modified';
                if (oldVal === null || oldVal === undefined)
                    changeType = 'added';
                else if (newVal === null || newVal === undefined)
                    changeType = 'removed';
                changes.push({
                    field: key,
                    oldValue: oldVal != null ? oldStr : null,
                    newValue: newVal != null ? newStr : null,
                    changeType,
                });
            }
        }
        return {
            hasChanges: changes.length > 0,
            changes,
            isNew: false,
        };
    }
}
exports.ChangeDetector = ChangeDetector;
//# sourceMappingURL=change-detector.js.map