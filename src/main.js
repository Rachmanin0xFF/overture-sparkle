import { DuckDBManager } from './duckdb-manager.js';

const dbManager = new DuckDBManager();
await dbManager.initialize();
const result = await dbManager.queryForVisualization([-74.439497, 40.846200, -74.418790, 40.856653], 'base', 'water');
console.log('Query Result:', result);
console.log('Query Result:', result[0].geometry);