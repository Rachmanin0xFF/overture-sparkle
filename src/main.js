import { DuckDBPoolManager } from './duckdb-manager.js';
import {  createVisualizer } from './visualizer.js';

window.uiControls.disableAllButtons();
window.uiControls.setStatus("Initializing DuckDB...", "loading");

// 5 instances should be fine (hope everyone's memory is okay)
const dbManager = new DuckDBPoolManager(3, '2025-05-21.0');
await dbManager.initialize();

let visualizer = createVisualizer();
await visualizer.init();

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

        const results = await Promise.all([
            dbManager.queryForVisualization(bbox, 'transportation', 'segment'),
            dbManager.queryForVisualization(bbox, 'places', 'place'),
            dbManager.queryForVisualization(bbox, 'base', 'land'),
            dbManager.queryForVisualization(bbox, 'base', 'water'),
            dbManager.queryForVisualization(bbox, 'base', 'land_cover'),
            dbManager.queryForVisualization(bbox, 'base', 'bathymetry'),
        ]);
        results.bbox = bbox;
        console.log("Queries completed:", results);
        visualizer.updateData(results);
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