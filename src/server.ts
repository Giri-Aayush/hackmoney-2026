/**
 * Optix API Server Entry Point
 *
 * Start with: npm run server
 */

import { OptixServer } from './api/index.js';

const PORT = parseInt(process.env.PORT || '8081', 10);

const server = new OptixServer({
  port: PORT,
  enableWebSocket: true,
  priceUpdateInterval: 5000, // 5 seconds
});

// Handle shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await server.stop();
  process.exit(0);
});

// Start server
server.start().catch(console.error);
