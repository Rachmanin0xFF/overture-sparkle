
export async function loadManifest(manifestPath) {
    const response = await fetch(manifestPath);
    const manifest = await response.json();

    const filesWithBounds = [];
    
    manifest.themes.forEach(theme => {
      theme.types.forEach(type => {
        type.files.forEach(file => {
          filesWithBounds.push({
            theme: theme.name,
            type: type.name,
            filename: file.name,
            bbox: file.bbox,
            fullPath: `${manifest.s3_location}${theme.relative_path}${type.relative_path}/${file.name}`
          });
        });
      });
    });
    
    return filesWithBounds;
}

function bboxIntersects(bbox1, bbox2) {
    // bbox format: [minX, minY, maxX, maxY]
    const [minX1, minY1, maxX1, maxY1] = bbox1;
    const [minX2, minY2, maxX2, maxY2] = bbox2;
    
    return !(maxX1 < minX2 || maxX2 < minX1 || maxY1 < minY2 || maxY2 < minY1);
}

function explodeWildcardPath(manifest, path) {
    /**
     * match all the names in the manifest with the given path (which may contain wildcards) using regex
    * probably useful for 'translating' conventional wildcard queries into duckdb-wasm-friendly ones
    */
    const regex = new RegExp(path.replace(/\*/g, '.*'));
    return manifest.filter(file => regex.test(file.fullPath));
}

function findMatchingFiles(manifest, queryBbox, theme=null, type=null) {
    /**
     * Find files in the manifest that intersect with the given bounding box and match the theme and type.
     * If theme or type is '*', it will match all themes or types respectively.
     */
    let files =  manifest.filter(file => bboxIntersects(file.bbox, queryBbox));
    console.log(type);
    console.log(theme);
    console.log(manifest);
    console.log(files);
    if (theme && theme != '*') {
        files = files.filter(file => file.theme === theme);
    }
    if (type && type != '*') {
        files = files.filter(file => file.type === type);
    }
    return files.map(file => file.fullPath);
}


export function constructQuery(manifest, queryBbox, theme='*', type='*') {
    const files = findMatchingFiles(manifest, queryBbox, theme, type);
    const WKTEnvelope = `ST_MakeEnvelope(${queryBbox[0]}, ${queryBbox[1]}, ${queryBbox[2]}, ${queryBbox[3]})`;

    const fields = {
        "id": "id"
    }
    if (theme === "transportation" && type === "segment") {
        fields["geometry"] = "ST_AsText(geometry)";
        fields["class"] = "class";
        fields["subclass"] = "subclass";
    } else if (theme === "places" && type === "place") {
        fields["geometry"] = "ST_AsText(geometry)";
    } else if (theme === "buildings" && type === "building") {
        fields["geometry"] = "ST_AsText(geometry)";
    } else if (theme === "base" && type === "land") {
        fields["geometry"] = "ST_AsText(geometry)";
        fields["elevation"] = "elevation";
    } else if (theme === "base" && type === "bathymetry") {
        fields["geometry"] = "ST_AsText(geometry)";
        fields["elevation"] = "elevation";
    } else if (theme === "base" && type === "water") {
        fields["geometry"] = `ST_AsText(ST_ExteriorRing(ST_Intersection(geometry, ${WKTEnvelope})))`
    } else if (theme === "base" && type === "land cover") {
        fields["geometry"] = `ST_AsText(ST_ExteriorRing(ST_Intersection(geometry, ${WKTEnvelope})))`
    }

    if (files.length === 0) {
        throw new Error('No files found for the given query');
    }
    
    const fileListText = files.map(file => `'s3://${file}'`).join(',\n    ');
    const query = `
SELECT
    ${Object.entries(fields).map(([alias, column]) => `${column} AS ${alias}`).join(',\n    ')}
FROM read_parquet([
    ${fileListText}
])
WHERE
    bbox.xmax > ${queryBbox[0]} AND
    bbox.ymax > ${queryBbox[1]} AND
    bbox.xmin < ${queryBbox[2]} AND
    bbox.ymin < ${queryBbox[3]}
;`
   return query; 
}