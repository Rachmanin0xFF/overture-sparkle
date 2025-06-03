
export function createVisualizer(initialData) {
let currentData = initialData;
let p5Instance;

let sketch = function(p) {
    let visualizerParameters = {
        backgroundColor: '#ffffff',
        strokeColor: '#000000',
        fillColor: '#ff0000'
    };

    p.setup = function() {
        let canvas = p.createCanvas(800, 600);
        canvas.parent('p5-container');
        p.background(visualizerParameters.backgroundColor);
        console.log("p5.js sketch initialized with data:", currentData);
        p.noLoop();
        p.redraw();
    };

    p.draw = function() {
        p.background(visualizerParameters.backgroundColor);
        p.stroke(visualizerParameters.strokeColor);
        p.fill(visualizerParameters.fillColor);
        
        if (currentData && currentData.length > 0) {
            p.rect(50, 50, 100, 100);
            p.text(`Data points: ${currentData.length}`, 200, 50);
        } else {
            p.text("No data to display.", 50, 50);
        }
    };
    
    p.updateData = function(newData) {
        currentData = newData;
        console.log("Visualizer data updated:", currentData);
        p.redraw();
    };

    p.updateParameters = function(newParams) {
        visualizerParameters = { ...visualizerParameters, ...newParams };
        console.log("Visualizer parameters updated:", visualizerParameters);
        p.redraw();
    };
};

p5Instance = new p5(sketch);

return {
    updateData: (newData) => p5Instance.updateData(newData),
    updateParameters: (newParams) => p5Instance.updateParameters(newParams),
};
}
