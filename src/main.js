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
        const split_array = boundingBox.replace(/[ ()]/g, "").split(',');
        const bbox = split_array.map(Number);
        visualizer.clear();

        const result = await dbManager.queryForVisualization(bbox, 'transportation', 'segment');
        result.bbox = bbox;
        console.log('Query Result:', result);
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
        visualizer.renderVisualization(width, style);
        window.uiControls.enableButtons(['query', 'render', 'save']);
        window.uiControls.setStatus("Data retrieved", "success");
    } catch (error) {
        console.error('Visualization failed:', error);
        window.uiControls.enableButtons(['query', 'render']);
        window.uiControls.setStatus("Visualization failed!", "error");
    }
});

window.addEventListener('saveImage', async (e) => {
    try {
        visualizer.saveImage();
    } catch (error) {
        console.error('Image save failed:', error);
    }
});