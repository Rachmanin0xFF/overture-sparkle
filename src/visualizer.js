
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
        p.loadStyleSelection();
    }

    p.loadStyleSelection = function() {
        selectedStyle = styles[document.getElementById('visual-style').value];
        window.jsonEditor.setValue(JSON.stringify(selectedStyle, null, 2));
    }

    p.draw = function() {
        if(styles) {
            const editorElement = window.jsonEditor.getWrapperElement();
            try {
                selectedStyle = JSON.parse(window.jsonEditor.getValue());
                editorElement.style.border = "2px solid #2ed1b9";
            } catch(error) {
                // set jsonEditor border to red
                editorElement.style.border = "2px solid #e8384c";

            }
            p.background(selectedStyle.background.color);
        }
        if(!pg && styles) {
            p.textAlign(p.CENTER, p.CENTER);
            const col = p.color(200);
            col.setAlpha(255 * loadingLerp);
            p.fill(col);
            p.text("This might take a minute...", 0, 80);

            drawLoadingOrbs(selectedStyle);
        }
        if(rendering) {
            render();
        }
        if(pg) drawRenderPreview();
        if(rendering) {
            p.fill(0);
            p.noStroke();
            p.rect(-p.width*0.25, -10, p.width*0.5, 20);
            p.fill(255);
            p.rect(-p.width*0.25, -10, p.width*0.5*(entriesSoFar*1.0 / totalEntries), 20);
        } else entriesSoFar = 0;
    };

    function drawLoadingOrbs(style) {
        let names = Object.keys(style);
        
        let orbs = [];
        for(let i = 0; i < names.length; i++) {
            let theme = style[names[i]];
            if(theme.fill_color || theme.stroke_color) {
                orbs.push(theme);
            }
        }

        if(window.uiControls.isLoading()) {
            loadingLerp = p.lerp(loadingLerp, 1.0, 0.05);
        } else {
            loadingLerp = p.lerp(loadingLerp, 0.0, 0.2);
        }
        let padding = 50;
        p.noStroke();
        let xi = -p.width / 2.0 + 2.0 * p.width / (orbs.length + 4);
        let i = 0;
        orbs.forEach(orb => {
            p.strokeWeight(1);
            p.noStroke();
            p.noFill();
            applyStyle(orb);
            
            let yoff = -loadingLerp * 50.0 * p.sqrt(p.max(0.0, p.sin(p.frameCount / 20.0 + i)));
            p.ellipse(xi + padding, yoff, 30, 30);
            xi += (p.width / (orbs.length + 4));
            i += 1;
        });
    }

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
    p.renderViz = function(width, style) {
        renderStyle = style;
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
    let totalEntries = 0;
    let entriesSoFar = 0;
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

                    for(let i = 0; i < batchSize; i++) {
                        if(itemIndex >= dictionary[layerEnumeration[layerIndex]].length) {
                            layerIndex++;
                            itemIndex = 0;
                            pg.end();
                            return;
                        }
                        const item = dictionary[layerEnumeration[layerIndex]][itemIndex];
                        p.noStroke();
                        p.noFill();
                        p.strokeWeight(1);
                        let z = applyStyle(themeStyle);
                        if(themeStyle.rules) {
                            for(const rule of themeStyle.rules) {
                                let z_res = parseRule(rule, item);
                                if(rule.style.z_index) z = Z_res;
                            }
                        }
                        if(item.geometry) drawWKT(item.geometry, pg, z);
                        itemIndex++;
                        entriesSoFar++;
                    }
                }
                break;

        }
        pg.end();
        drawRenderPreview();
    }

    function parseRule(rule, item) {
        // we get something like
        // {
        //      condition: {
        //          class: [motorway, secondary]
        //      }, 
        //      style: {fill_color: red}}
        // }
        // for the rule
        if(!rule.condition || !rule.style) return;
        let cond_satisfied = true;
        for(let property in rule.condition) {
            //here, property is "class"
            cond_satisfied &= item[property] && rule.condition[property].includes(item[property]);
        }
        if(cond_satisfied) return applyStyle(rule.style);
    }

    function applyStyle(style) {
        if(style.fill_color)    p.fill(style.fill_color);
        if(style.stroke_color)        p.stroke(style.stroke_color);
        if(style.stroke_weight) p.strokeWeight(style.stroke_weight);
        return style.z_index ? style.z_index : 0;
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
                const vArr = [];
                for (let i = 1; i < arr.length; i += 2) {
                    const v = parseVertex(arr[i], arr[i+1], g);
                    vArr.push(v);
                }
                for (let i = 0; i < vArr.length-1; i++) {
                    p.line(vArr[i].x, vArr[i].y, z, vArr[i+1].x, vArr[i+1].y, z);
                }
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
                // console.error("Failed to display WKT: ", wkt);
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
                    [bbox.lon_min,bbox.lat_min,bbox.lon_max,bbox.lat_max].join("_")
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
        totalEntries = 0;
        console.log("current data", currentData);
        for(let i = 0; i < currentData.length; i++) {
            totalEntries += currentData[i].length;
        }
        console.log(totalEntries);
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
    styleMenuChange: () => p5Instance.loadStyleSelection()
};
}
