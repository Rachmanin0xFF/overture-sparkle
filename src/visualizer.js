
export function createVisualizer(initialData) {
let currentData = initialData;
let p5Instance;

let sketch = function(p) {
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
    let loadingLerp = 0.0; // eased loading boolean for animation
    // current geometry bbox
    let bbox = {
        lon_min: 0,
        lat_min: 0,
        lon_max: 0,
        lat_max: 0
    };
    let pg; // p5.Graphics object for off-screen rendering
    let selectedStyle;
    let styles;
    let rendering = false;

    p.setup = function(stylePath = './styles.json') {
        // ========== p5 canvas and DOM setup ========== //
        const container = document.getElementById('p5-container');
        let canvas = p.createCanvas(
            p.floor(container.offsetWidth),
            p.floor(p.min(container.offsetHeight, container.offsetWidth)),
            p.WEBGL
        );
        p.pixelDensity(1);
        const placeholder = container.querySelector('.placeholder-text');
        if (placeholder) {
            placeholder.remove();
        }
        canvas.parent('p5-container');
        p.background(255);
        console.log("p5.js sketch initialized with data:", currentData);

        // ========== Font ========== //
        let font = p.loadFont('Montserrat-Light.ttf');
        p.textFont(font);
        p.textSize(24);
    };

    p.init = async function() {
        await loadStyles();
    }

    async function loadStyles(stylePath = './styles.json') {
        // ========== Styles ========== //
        const response = await fetch(stylePath);
        styles = (await response.json()).styles;
    }

    p.draw = function() {
        if(styles) {
            selectedStyle = styles[document.getElementById('visual-style').value];
            p.background(selectedStyle.background.color);
        }
        if(!pg && styles) {
            p.textAlign(p.CENTER, p.CENTER);
            const col = p.color(selectedStyle.segment.stroke_color);
            col.setAlpha(255 * loadingLerp);
            p.fill(col);
            p.text("This might take a minute...", 0, 80);

            function drawLoadingOrbs(colors) {
                if(window.uiControls.isLoading()) {
                    loadingLerp = p.lerp(loadingLerp, 1.0, 0.05);
                } else {
                    loadingLerp = p.lerp(loadingLerp, 0.0, 0.2);
                }
                let padding = 50;
                p.noStroke();
                let xi = -p.width / 2.0 + 2.0 * p.width / (colors.length + 4);
                let i = 0;
                colors.forEach(color => {
                    p.fill(color);
                    let yoff = -loadingLerp * 50.0 * p.sqrt(p.max(0.0, p.sin(p.frameCount / 20.0 + i)));
                    p.ellipse(xi + padding, yoff, 30, 30);
                    xi += (p.width / (colors.length + 4));
                    i += 1;
                });
            }
            drawLoadingOrbs([
                selectedStyle.water.fill_color,
                selectedStyle.building.fill_color,
                selectedStyle.segment.stroke_color,
                selectedStyle.place.stroke_color
            ]);
        }
        if(rendering) {
            render();
        }
        if(pg) drawRenderPreview();
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

    let renderStyle;
    p.renderViz = function(width, styleName) {
        renderStyle = styles[styleName];
        let _aspect = (bbox.lat_max - bbox.lat_min) / (bbox.lon_max - bbox.lon_min);
        _aspect /= p.cos(0.0174533*(bbox.lat_max + bbox.lat_min)*0.5);
        
        let options = {
            width: width,
            height: parseInt(width * _aspect),
            antialias: 4,
            density: 1,
            depth: true,
        };
        if(pg) {
            pg.remove();
            pg = undefined;
        }
        pg = p.createFramebuffer(options); // pass this to drawWKT

        p.background(renderStyle.background.color);
        pg.begin();
        p.background(renderStyle.background.color);
        p.stroke(0);
        p.strokeWeight(1.5);
        pg.end();
        drawRenderPreview();
        
        rendering = true;
        layerIndex = 0;
        itemIndex = 0;
        // dump all the keys from selectedStyle into layerEnumeration
        layerEnumeration = Object.keys(renderStyle);
        console.log(layerEnumeration);
    }

    let layerIndex = 0;
    let itemIndex = 0;
    let batchSize = 1000;
    let layerEnumeration = [];
    function render() {
        const dictionary = Object.fromEntries(
            currentData.map(item => [item.type, item])
        );
        pg.begin();
        switch(layerEnumeration[layerIndex]) {
            case 'background':
                layerIndex++;
                break;
            case 'format_version':
                // not a layer, skip
                layerIndex++;
                break;
            default:
                if(layerIndex >= layerEnumeration.length) {
                    // all layers rendered, stop rendering
                    rendering = false;
                    console.log("Rendering complete.");
                    pg.end();
                    return;
                } else {
                    const themeName = layerEnumeration[layerIndex];
                    const themeStyle = renderStyle[themeName];
                    
                    let z;
                    p.noStroke();
                    p.noFill();
                    p.strokeWeight(1);
                    
                    z = themeStyle.z_index ? themeStyle.z_index : 0;
                    if(themeStyle.fill_color)    p.fill(themeStyle.fill_color);
                    if(themeStyle.stroke_color)        p.stroke(themeStyle.stroke_color);
                    if(themeStyle.stroke_weight) p.strokeWeight(themeStyle.stroke_weight);

                    for(let i = 0; i < batchSize; i++) {
                        if(itemIndex >= dictionary[layerEnumeration[layerIndex]].length) {
                            layerIndex++;
                            itemIndex = 0;
                            pg.end();
                            return;
                        }
                        const item = dictionary[layerEnumeration[layerIndex]][itemIndex];
                        if(item.geometry) drawWKT(item.geometry, pg, z);
                        itemIndex++;
                    }
                }
                break;

        }
        pg.end();
        drawRenderPreview();
    }

    function drawWKT(wkt, g, z) {
        // remove parenthesis, commas
        const arr = wkt.replace(/[(),]/g, "").split(' ');
        switch(arr[0]) {
            case 'POINT':
                const v = parseVertex(arr[1], arr[2], g);
                p.point(v.x, v.y, z);
                break;
            case 'LINESTRING':
                p.beginShape();
                for (let i = 1; i < arr.length; i += 2) {
                    const v = parseVertex(arr[i], arr[i+1], g);
                    p.vertex(v.x, v.y, z);
                }
                p.endShape();
                break;
            case 'POLYGON':
                p.beginShape();
                for (let i = 1; i < arr.length; i += 2) {
                    const v = parseVertex(arr[i], arr[i + 1], g);
                    p.vertex(v.x, v.y, z);
                }
                p.endShape(p.CLOSE);
                break;
            default:
                console.error("Failed to display WKT: ", wkt);
                break;
        }
    }

    function parseVertex(wktx, wkty, g) {
        const x = parseFloat(wktx);
        const y = parseFloat(wkty);
        if (isNaN(x) || isNaN(y)) {
            return { x: 0, y: 0 };
        } 
        return {
            x:  g.width  * (x - (bbox.lon_min + bbox.lon_max)*0.5) / (bbox.lon_max - bbox.lon_min),
            y: -g.height * (y - (bbox.lat_min + bbox.lat_max)*0.5) / (bbox.lat_max - bbox.lat_min),
        };
    }

    p.saveImage = async function() {
        if(pg) {
            // p5's built-in save functions don't work for framebuffers, for some reason
            // this is the easiest alternative
            pg.loadPixels();
            const canvas = document.createElement('canvas');
            canvas.width = pg.width;
            canvas.height = pg.height;
            
            const ctx = canvas.getContext('2d');
            const imageData = new ImageData(new Uint8ClampedArray(pg.pixels), pg.width, pg.height);
            ctx.putImageData(imageData, 0, 0);
            
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `visualization${
                    [bbox.lon_min,bbox.lat_min,bbox.lon_max,bbox.lat_max,selectedStyle].join("-")
                }.png`;
                link.click();
                URL.revokeObjectURL(url);
            }, 'image/png');
        } else {
            console.error("Unable to save image: no saveable framebuffer found!")
        }
    }
    

    p.updateData = function(newData) {
        currentData = newData;
        [bbox.lon_min, bbox.lat_min, bbox.lon_max, bbox.lat_max] = currentData.bbox;
    };

    p.windowResized = function() {
        const container = document.getElementById('p5-container');
        p.resizeCanvas(
            p.floor(container.offsetWidth),
            p.floor(p.min(container.offsetHeight, container.offsetWidth))
        );
        drawRenderPreview();
    }

    p.clearViz = function() {
        if(pg) {
            pg.remove();
            pg = undefined;
        }
        currentData = [];
        p.background(selectedStyle.background.color);
    };
};

p5Instance = new p5(sketch);

return {
    updateData: (newData) => p5Instance.updateData(newData),
    updateParameters: (newParams) => p5Instance.updateParameters(newParams),
    renderVisualization: (width, style) => p5Instance.renderViz(width, style),
    saveImage: () => p5Instance.saveImage(),
    clear: () => p5Instance.clearViz(),
    init: () => p5Instance.init(),
};
}
