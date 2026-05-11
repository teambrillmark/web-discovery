import { EventEmitter } from 'events';
import type { AgentEvent } from '../agents/types';

class JobRegistry {
  private jobs = new Map<string, EventEmitter>();

  create(jobId: string): EventEmitter {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(20);
    this.jobs.set(jobId, emitter);
    // Auto-cleanup after 15 minutes
    setTimeout(() => this.jobs.delete(jobId), 15 * 60 * 1000);
    return emitter;
  }

  get(jobId: string): EventEmitter | undefined {
    return this.jobs.get(jobId);
  }

  emit(jobId: string, event: AgentEvent): void {
    this.jobs.get(jobId)?.emit('progress', event);
  }

  done(jobId: string, data?: Record<string, unknown>): void {
    const emitter = this.jobs.get(jobId);
    if (emitter) {
      emitter.emit('done', data ?? {});
      setTimeout(() => this.jobs.delete(jobId), 5000);
    }
  }

  error(jobId: string, message: string): void {
    const emitter = this.jobs.get(jobId);
    if (emitter) {
      emitter.emit('error', { message });
      setTimeout(() => this.jobs.delete(jobId), 5000);
    }
  }
}

export const jobRegistry = new JobRegistry();
