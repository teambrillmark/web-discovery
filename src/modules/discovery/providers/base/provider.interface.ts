import type { DiscoveryInput, IDiscoveryProvider, ProviderResult } from '../../types';

/**
 * Re-export for consumers who want to implement a new provider.
 *
 * To add a provider:
 *   1. Create a class that implements IDiscoveryProvider
 *   2. Pass an instance to DiscoveryService in your DI wiring
 *
 * The service will call discover() on all registered providers in parallel.
 * Provider failures must be handled inside the provider — they must never throw.
 * Return [] on failure so the pipeline continues with results from other providers.
 */
export type { DiscoveryInput, IDiscoveryProvider, ProviderResult };
