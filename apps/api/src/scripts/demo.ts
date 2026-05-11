import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../../..', '.env') });

import { DiscoveryOrchestrator } from '../services/discovery-orchestrator';

const DEMO_QUERIES = [
  'Find competitors of brillmark.com',
  'Best Shopify CRO agencies',
  'Best CRO companies using Optimizely',
  'Sports jersey manufacturers in Delhi',
];

async function runDemo() {
  console.log('🚀 Running Discovery Engine Demo\n');
  console.log('=' .repeat(50));

  for (const query of DEMO_QUERIES) {
    console.log(`\n📍 Query: "${query}"`);
    console.log('-'.repeat(40));

    const orchestrator = new DiscoveryOrchestrator();
    await orchestrator.run(query);

    // Wait between queries to be respectful
    console.log('⏳ Waiting 5s before next query...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  console.log('\n✅ Demo complete! Check the database for results.');
  process.exit(0);
}

runDemo().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
