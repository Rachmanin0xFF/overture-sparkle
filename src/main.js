import { DuckDBVisualizationManager } from './duckdb-manager.js';
import {  createVisualizer } from './visualizer.js';

window.uiControls.disableAllButtons();
window.uiControls.setStatus("Initializing DuckDB...", "loading");

const dbManager = new DuckDBVisualizationManager();
await dbManager.initialize();
let visualizer = createVisualizer();

window.uiControls.setStatus("Ready to query", "success");

window.uiControls.enableButtons(['query']);

window.addEventListener('queryOverture', (e) => {
const { boundingBox, style } = e.detail;
    
});

window.addEventListener('queryOverture', async (e) => {
    window.uiControls.setStatus("Querying...", "loading");
    window.uiControls.disableAllButtons();
    const { boundingBox, style } = e.detail;
    try {
        const result = await dbManager.queryForVisualization([-74.439497, 40.846200, -74.418790, 40.856653], 'base', 'water');
        console.log('Query Result:', result);
        console.log('Query Result:', result[0].geometry);
        visualizer.updateData(result);
        window.uiControls.enableButtons(['query', 'render']);
        window.uiControls.setStatus("Data retrieved", "success");
    } catch (error) {
        console.error('Query failed:', error);
        window.uiControls.enableButtons(['query']);
        window.uiControls.setStatus("Query failed!", "error");
    }
});

window.addEventListener('renderVisualization', async (e) => {
    window.uiControls.setStatus("Rendering...", "loading");
    window.uiControls.disableAllButtons();
    const { width, height, style } = e.detail;
    try {
        visualizer.renderVisualization(width, height, style);
        window.uiControls.enableButtons(['query', 'render', 'save']);
        window.uiControls.setStatus("Data retrieved", "success");
    } catch (error) {
        console.error('Query failed:', error);
        window.uiControls.enableButtons(['query', 'render']);
        window.uiControls.setStatus("Visualization failed!", "error");
    }
});