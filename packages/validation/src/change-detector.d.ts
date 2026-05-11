import { ChangeDetectionResult } from '@discovery/shared';
export declare class ChangeDetector {
    hash(data: object): string;
    detect(oldSnapshot: Record<string, unknown>, newSnapshot: Record<string, unknown>): ChangeDetectionResult;
}
