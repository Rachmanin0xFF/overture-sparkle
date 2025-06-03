
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
    let bbox = {
        lon_min: 0,
        lat_min: 0,
        lon_max: 0,
        lat_max: 0
    };
    let pg; // p5.Graphics object for off-screen rendering

    p.setup = function() {
        const container = document.getElementById('p5-container');
        let canvas = p.createCanvas(container.offsetWidth, p.min(container.offsetHeight, container.offsetWidth), p.WEBGL);

        const placeholder = container.querySelector('.placeholder-text');
        if (placeholder) {
            placeholder.remove();
        }
        canvas.parent('p5-container');
        p.background(visualizerParameters.backgroundColor);
        console.log("p5.js sketch initialized with data:", currentData);

        let font = p.loadFont('Montserrat-Light.ttf');
        p.textFont(font);
        p.textSize(24);
    };

    p.draw = function() {
        if(!pg) {
            const selectedStyle = document.getElementById('visual-style').value;
            visualizerParameters = { ...visualizerParameters, ...visualStyles[selectedStyle]};
            
            p.background(visualizerParameters.backgroundColor);
            p.textAlign(p.CENTER, p.CENTER);
            const col = p.color(visualizerParameters.roadColor);
            col.setAlpha(255 * loadingLerp);
            p.fill(col);
            p.text("This could take a few minutes...", 0, 80);

            function drawLoadingOrbs(keys) {
                if(window.uiControls.isLoading()) {
                    loadingLerp = p.lerp(loadingLerp, 1.0, 0.05);
                } else {
                    loadingLerp = p.lerp(loadingLerp, 0.0, 0.2);
                }
                let padding = 50;
                p.noStroke();
                let xi = -p.width / 2.0 + 2.0 * p.width / (keys.length + 4);
                let i = 0;
                keys.forEach(key => {
                    const color = visualizerParameters[key];
                    p.fill(color);
                    let yoff = -loadingLerp * 50.0 * p.sqrt(p.max(0.0, p.sin(p.frameCount / 20.0 + i)));
                    p.ellipse(xi + padding, yoff, 30, 30);
                    xi += (p.width / (keys.length + 4));
                    i += 1;
                });
            }
            drawLoadingOrbs(['waterColor', 'groundCoverColor', 'roadColor', 'emphasisColor']);
        }
    };

    function drawRenderPreview() {
        if(pg) {
            let shrink = p.min(p.height / pg.height, p.width / pg.width);
            p.push();
            p.scale(shrink);
            p.image(pg, -pg.width / 2, -pg.height / 2);
            p.pop();
        }
    }

    p.renderViz = function(width, selectedStyle) {
        visualizerParameters = { ...visualizerParameters, ...visualStyles[selectedStyle] };
        let _aspect = (bbox.lat_max - bbox.lat_min) / (bbox.lon_max - bbox.lon_min);
        
        let options = {
            width: width,
            height: parseInt(width * _aspect),
            antialias: 4,
            depth: false,
        };
        pg = p.createFramebuffer(options);

        p.background(visualizerParameters.backgroundColor);
        pg.begin();
        p.stroke(0, 0, 0);
        p.strokeWeight(3);
        for (let i = 0; i < currentData.length; i++) {
            const item = currentData[i];
            if (item.geometry) {
                drawWKT(item.geometry, pg);
            }
        }
        pg.end();
        drawRenderPreview();
    }

    function drawWKT(wkt, g) {
        const arr = wkt.replace(/[(),]/g, "").split(' ');
        switch(arr[0]) {
            case 'POINT':
                const v = parseVertex(arr[i], arr[i+1], g);
                p.point(v.x, v.y, 10, 10);
                break;
            case 'LINESTRING':
                p.noFill();
                p.beginShape();
                for (let i = 1; i < arr.length; i += 2) {
                    const v = parseVertex(arr[i], arr[i+1], g);
                    p.vertex(v.x, v.y);
                }
                p.endShape();
                break;
            case 'POLYGON':
                p.beginShape();
                for (let i = 1; i < arr.length; i += 2) {
                    const v = parseVertex(arr[i], arr[i + 1], g);
                    p.vertex(v.x, v.y);
                }
                p.endShape(p.CLOSE);
                break;
        }
    }

    function parseVertex(wktx, wkty, g) {
        const x = parseFloat(wktx);
        const y = parseFloat(wkty);
        if (isNaN(x) || isNaN(y)) {
            return { x: 0, y: 0 }; // Return a default value or handle error appropriately
        } 
        return {
            x:  g.width  * (x - (bbox.lon_min + bbox.lon_max)*0.5) / (bbox.lon_max - bbox.lon_min),
            y: -g.height * (y - (bbox.lat_min + bbox.lat_max)*0.5) / (bbox.lat_max - bbox.lat_min),
        };
    }

    p.updateData = function(newData) {
        currentData = newData;
        console.log("Visualizer data updated:", currentData);
        [bbox.lon_min, bbox.lat_min, bbox.lon_max, bbox.lat_max] = currentData.bbox;
    };

    p.updateParameters = function(newParams) {
        visualizerParameters = { ...visualizerParameters, ...newParams };
        console.log("Visualizer parameters updated:", visualizerParameters);
    };

    p.windowResized = function() {
        const container = document.getElementById('p5-container');
        p.resizeCanvas(container.offsetWidth, p.min(container.offsetHeight, container.offsetWidth));
        drawRenderPreview();
    }
};

p5Instance = new p5(sketch);

return {
    updateData: (newData) => p5Instance.updateData(newData),
    updateParameters: (newParams) => p5Instance.updateParameters(newParams),
    renderVisualization: (width, style) => p5Instance.renderViz(width, style)
};
}
