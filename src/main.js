import { DuckDBVisualizationManager } from './duckdb-manager.js';
import {  createVisualizer } from './visualizer.js';

let visualizer = createVisualizer();
visualizer.updateParameters({
    backgroundColor: '#f0f0f0',
    strokeColor: '#333',
    fillColor: '#ffcc00'
});

const dbManager = new DuckDBVisualizationManager();
await dbManager.initialize();
const result = await dbManager.queryForVisualization([-74.439497, 40.846200, -74.418790, 40.856653], 'base', 'water');
console.log('Query Result:', result);
console.log('Query Result:', result[0].geometry);