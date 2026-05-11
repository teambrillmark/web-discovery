import { createHash } from 'crypto';
import { ChangeDetectionResult, EntityChange } from '@discovery/shared';

export class ChangeDetector {
  hash(data: object): string {
    return createHash('md5').update(JSON.stringify(data)).digest('hex');
  }

  detect(oldSnapshot: Record<string, unknown>, newSnapshot: Record<string, unknown>): ChangeDetectionResult {
    const changes: EntityChange[] = [];
    const oldHash = this.hash(oldSnapshot);
    const newHash = this.hash(newSnapshot);

    if (oldHash === newHash) {
      return { hasChanges: false, changes: [], isNew: false };
    }

    const allKeys = new Set([...Object.keys(oldSnapshot), ...Object.keys(newSnapshot)]);
    const skipKeys = new Set(['updatedAt', 'lastSeen', 'rawHtml']);

    for (const key of allKeys) {
      if (skipKeys.has(key)) continue;
      const oldVal = oldSnapshot[key];
      const newVal = newSnapshot[key];
      const oldStr = JSON.stringify(oldVal);
      const newStr = JSON.stringify(newVal);

      if (oldStr !== newStr) {
        let changeType: 'added' | 'removed' | 'modified' = 'modified';
        if (oldVal === null || oldVal === undefined) changeType = 'added';
        else if (newVal === null || newVal === undefined) changeType = 'removed';

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
