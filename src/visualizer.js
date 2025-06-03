
export function createVisualizer(initialData) {
let currentData = initialData;
let p5Instance;

let sketch = function(p) {
    let visualizerParameters = {
        backgroundColor: '#ffffff',
        strokeColor: '#000000',
        fillColor: '#ff0000'
    };
    // Colors in the April 2024 Overture Brand Guidelines:
    // Primaries:
    // - #2c2e7f
    // - #0ec1bd
    // - #4051cc
    // Secondaries:
    // - #05a5af
    // - #4edad8
    // - #00a790
    // Accent:
    // - #96c93d
    // Light:
    // - #ffffff
    // Dark:
    // - #001a39
    let visualStyles = {
        'classic': {
            backgroundColor: '#001a39',
            waterColor: '#2c2e7f',
            groundCoverColor: '#05a5af',
            roadColor: '#ffffff',
            emphasisColor: '#4edad8',
        },
        'light': {
            backgroundColor: '#f0f0f0',
            waterColor: '#a0c0ff',
            groundCoverColor: '#c0ffc0',
            roadColor: '#404040',
            emphasisColor: '#ff8080',
        },
    }
    let loadingLerp = 0.0; // eased loading boolean for animation

    p.setup = function() {
        const container = document.getElementById('p5-container');
        let canvas = p.createCanvas(container.offsetWidth, p.min(container.offsetHeight, container.offsetWidth));

        const placeholder = container.querySelector('.placeholder-text');
        if (placeholder) {
            placeholder.remove();
        }
        canvas.parent('p5-container');
        p.background(visualizerParameters.backgroundColor);
        console.log("p5.js sketch initialized with data:", currentData);
    };

    function drawWKT(wkt) {
        
    }

    p.draw = function() {
        const selectedStyle = document.getElementById('visual-style').value;
        visualizerParameters = { ...visualizerParameters, ...visualStyles[selectedStyle] };
        
        p.background(visualizerParameters.backgroundColor);
        p.textAlign(p.CENTER, p.CENTER);
        const col = p.color(visualizerParameters.roadColor);
        col.setAlpha(255 * loadingLerp);
        p.fill(col);
        p.text("This could take a few minutes...", p.width/2, p.height/2 + 80);

        function drawOrbs(keys) {
            if(window.uiControls.isLoading()) {
                loadingLerp = p.lerp(loadingLerp, 1.0, 0.05);
            } else {
                loadingLerp = p.lerp(loadingLerp, 0.0, 0.2);
            }
            let padding = 50;
            p.noStroke();
            let xi = 2.0 * p.width / (keys.length + 4);
            let i = 0;
            keys.forEach(key => {
                const color = visualizerParameters[key];
                p.fill(color);
                let yoff = -loadingLerp * 50.0 * p.sqrt(p.max(0.0, p.sin(p.frameCount / 20.0 + i)));
                p.ellipse(xi + padding, p.height/2 + yoff, 30, 30);
                xi += (p.width / (keys.length + 4));
                i += 1;
            });
        }
        drawOrbs(['waterColor', 'groundCoverColor', 'roadColor', 'emphasisColor']);
    };

    p.renderViz = function(width, height, selectedStyle) {
        visualizerParameters = { ...visualizerParameters, ...visualStyles[selectedStyle] };
        const pg = p.createGraphics(width, height, p.WEBGL);

        pg.background(visualizerParameters.backgroundColor);
        for (let i = 0; i < currentData.length; i++) {
            const item = currentData[i];
            print(item);
        }
    }

    p.updateData = function(newData) {
        currentData = newData;
        console.log("Visualizer data updated:", currentData);
    };

    p.updateParameters = function(newParams) {
        visualizerParameters = { ...visualizerParameters, ...newParams };
        console.log("Visualizer parameters updated:", visualizerParameters);
    };

    p.windowResized = function() {
        const container = document.getElementById('p5-container');
        p.resizeCanvas(container.offsetWidth, p.min(container.offsetHeight, container.offsetWidth));
    }
};

p5Instance = new p5(sketch);

return {
    updateData: (newData) => p5Instance.updateData(newData),
    updateParameters: (newParams) => p5Instance.updateParameters(newParams),
    renderVisualization: () => p5Instance.renderViz()
};
}
