import { CompetitorDiscoveryWidget } from '@/components/CompetitorDiscoveryWidget';

export default function HomePage() {
  return (
    <main style={{ padding: '48px 40px', maxWidth: 780 }}>
      <h1 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 700 }}>Competitor Discovery</h1>
      <p style={{ color: '#666', margin: '0 0 36px', fontSize: 15, lineHeight: 1.6 }}>
        Enter a domain or URL. The pipeline will normalize it, load known exclusions, then run
        all discovery providers to find competitors.
      </p>
      <CompetitorDiscoveryWidget />
    </main>
  );
}
