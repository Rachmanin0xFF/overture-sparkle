import * as duckdb from '@duckdb/duckdb-wasm'
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url'
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url'
import duckdb_wasm_next from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url'
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url'

import { loadManifest, constructQuery } from './query-constructor.js';

class DuckDBManager {
    constructor(release_version='2025-05-21.0') {
        this.release_version = release_version
        this.release_path = `s3://overturemaps-us-west-2/release/${this.release_version}/`
        this.manifest_path = `overture-manifest_${this.release_version}.json`
        this.db = null;
        this.connection = null;
        this.manifest = null;
        this.isInitialized = false;
    }

    async _ensureInitialized() {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    async initialize() {
        if (this.isInitialized) return;

        this.manifest = await loadManifest(this.manifest_path);

        try {
            // Automatic bundles weren't working
        	const MANUAL_BUNDLES = {
            	mvp: {
                	mainModule: duckdb_wasm,
                	mainWorker: mvp_worker,
            	},
            	eh: {
                	mainModule: duckdb_wasm_next,
                	mainWorker: eh_worker,
            	},
        	}
        	
            // Initialize database
            const bundle = await duckdb.selectBundle(MANUAL_BUNDLES)
            const worker = new Worker(bundle.mainWorker)
            const logger = new duckdb.ConsoleLogger()
            
            this.db = new duckdb.AsyncDuckDB(logger, worker)
            await this.db.instantiate(bundle.mainModule, bundle.pthreadWorker)
            
            this.connection = await this.db.connect()
            
            // These are necessary for Overture data
            await this.connection.query('INSTALL spatial; LOAD spatial;')
            console.log('Spatial extension installed.');
            await this.setupS3Config();
            
            this.isInitialized = true;
            console.log('DuckDB initialized successfully');
        } catch (error) {
            console.error('Failed to initialize DuckDB:', error);
            throw error;
        }
    }

    async setupS3Config() {
        await this.connection.query(`
            SET s3_region='us-west-2';
        `);
    }

    async queryOverture(bbox, theme, type, rules=undefined) {
        await this._ensureInitialized();
        const sql = constructQuery(this.manifest, bbox, theme, type, rules);
        const query_result = await this.executeSQL(sql);
        return query_result;
    }
    
    async executeSQL(sql) {
        await this._ensureInitialized();

        console.log('Executing query:', sql);
        try {
            const result = await this.connection.query(sql);
            return result.toArray();
        } catch (error) {
            console.error('Query failed: ', error);
            throw error;
        }
    }

    async close() {
        if (this.connection) {
            await this.connection.close();
        }
        if (this.db) {
            await this.db.terminate();
        }
        this.isInitialized = false;
    }
}

export class DuckDBVisualizationManager extends DuckDBManager {
    constructor(release_version='2025-05-21.0') {
        super(release_version);
    }

    async queryForVisualization(bbox, theme, type) {
        await this._ensureInitialized();
        // I wanted to keep query-constructor use case-agnostic, so I feed it visualization-specific rules here
        const WKTEnvelope = `ST_MakeEnvelope(${bbox.join(', ')})`;
        const rules = [
            () => ({id: 'id'}),
            () => ({ geometry: theme === 'base' // Base themes contain polygons with holes (sometimes) -- TODO explode holes
              ? `CASE 
                    WHEN ST_GeometryType(geometry) = 'POLYGON' 
                    THEN ST_AsText(ST_ExteriorRing(ST_Intersection(geometry, ${WKTEnvelope})))
                    ELSE ST_AsText(${WKTEnvelope})
                    END`
              : `ST_AsText(geometry)` 
            }),
            
            () => theme === 'transportation' && type === 'segment' 
              ? { class: 'class', subclass: 'subclass' } 
              : {},
              
            () => theme === 'base' && type === 'land' 
              ? { elevation: 'elevation' } 
              : {},
            
            () => theme === 'base' && type === 'bathymetry' 
              ? { depth: 'depth' } 
              : {}
          ];
        const sql = constructQuery(this.manifest, bbox, theme, type, rules);
        const queryResult = await this.executeSQL(sql);
        return Array.from(queryResult).map(row => ({...row}));
    }
}
