import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../../../..', '.env') });

import { DiscoveryOrchestrator } from '../services/discovery-orchestrator';

async function main() {
  const query = process.argv[2];
  if (!query) {
    console.error('Usage: ts-node crawl.ts "your query here"');
    process.exit(1);
  }

  console.log(`\n🔍 Starting crawl for: "${query}"\n`);
  const orchestrator = new DiscoveryOrchestrator();
  await orchestrator.run(query);
  process.exit(0);
}

main().catch(err => {
  console.error('Crawl failed:', err);
  process.exit(1);
});
