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
        let queryResult = await this.executeSQL(sql);
        queryResult.bbox = bbox;
        queryResult.theme = theme;
        queryResult.type = type;
        return queryResult;
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
            () => ({ geometry: theme === 'base' && type !== 'bathymetry' // Base themes contain polygons with holes (sometimes) -- TODO explode holes
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
        let queryResult = await this.executeSQL(sql);
        let output = Array.from(queryResult).map(row => ({...row}));
        output.bbox = bbox;
        output.theme = theme;
        output.type = type;
        console.log(`Reply recieved with ${queryResult.length} rows`);
        return output;
    }
}

export class DuckDBPoolManager {
    constructor(poolSize = 3, release_version = '2025-05-21.0') {
        this.poolSize = poolSize;
        this.release_version = release_version;
        this.pool = [];
        this.availableInstances = [];
        this.busyInstances = new Set();
        this.queryQueue = [];
        this.isInitialized = false;
        this.isShuttingDown = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        console.log(`Initializing DuckDB pool with ${this.poolSize} instances...`);
        
        const initPromises = [];
        for (let i = 0; i < this.poolSize; i++) {
            const instance = new DuckDBVisualizationManager(this.release_version);
            this.pool.push(instance);
            initPromises.push(instance.initialize());
        }

        try {
            await Promise.all(initPromises);
            this.availableInstances = [...this.pool];
            this.isInitialized = true;
            console.log(`DuckDB pool initialized successfully with ${this.poolSize} instances`);
        } catch (error) {
            console.error('Failed to initialize DuckDB pool:', error);
            throw error;
        }
    }

    async _ensureInitialized() {
        if (!this.isInitialized) {
            await this.initialize();
        }
    }

    async queryForVisualization(bbox, theme, type) {
        await this._ensureInitialized();

        return new Promise((resolve, reject) => {
            const queryTask = {
                bbox,
                theme,
                type,
                resolve,
                reject,
                timestamp: Date.now()
            };

            this.queryQueue.push(queryTask);
            this._processQueue();
        });
    }

    async executeSQL(sql) {
        await this._ensureInitialized();

        return new Promise((resolve, reject) => {
            const queryTask = {
                sql,
                resolve,
                reject,
                timestamp: Date.now(),
                type: 'raw_sql'
            };

            this.queryQueue.push(queryTask);
            this._processQueue();
        });
    }

    _processQueue() {
        // Process as many queued tasks as we have available instances
        while (this.queryQueue.length > 0 && this.availableInstances.length > 0) {
            const task = this.queryQueue.shift();
            const instance = this.availableInstances.pop();
            
            this.busyInstances.add(instance);
            this._executeTask(instance, task);
        }
    }

    async _executeTask(instance, task) {
        try {
            let result;
            
            if (task.type === 'raw_sql') {
                result = await instance.executeSQL(task.sql);
            } else {
                result = await instance.queryForVisualization(task.bbox, task.theme, task.type);
            }
            
            task.resolve(result);
        } catch (error) {
            console.error('Query execution failed:', error);
            task.reject(error);
        } finally {
            // Return instance to available pool
            this.busyInstances.delete(instance);
            if (!this.isShuttingDown) {
                this.availableInstances.push(instance);
                // Process any remaining queued tasks
                this._processQueue();
            }
        }
    }

    // Get pool statistics
    getPoolStats() {
        return {
            poolSize: this.poolSize,
            availableInstances: this.availableInstances.length,
            busyInstances: this.busyInstances.size,
            queuedTasks: this.queryQueue.length,
            isInitialized: this.isInitialized
        };
    }

    // Get the current queue length
    getQueueLength() {
        return this.queryQueue.length;
    }

    // Check if all instances are busy
    isFullyUtilized() {
        return this.availableInstances.length === 0 && this.busyInstances.size === this.poolSize;
    }

    // Wait for all current tasks to complete
    async waitForAllTasks() {
        while (this.queryQueue.length > 0 || this.busyInstances.size > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // Clear the queue (cancel pending tasks)
    clearQueue() {
        const canceledTasks = this.queryQueue.splice(0);
        canceledTasks.forEach(task => {
            task.reject(new Error('Task canceled - queue was cleared'));
        });
        return canceledTasks.length;
    }

    // Gracefully shutdown the pool
    async shutdown() {
        console.log('Shutting down DuckDB pool...');
        this.isShuttingDown = true;

        // Cancel any pending tasks
        const canceledCount = this.clearQueue();
        if (canceledCount > 0) {
            console.log(`Canceled ${canceledCount} pending tasks`);
        }

        // Wait for active tasks to complete
        await this.waitForAllTasks();

        // Close all database connections
        const closePromises = this.pool.map(instance => instance.close());
        await Promise.all(closePromises);

        // Reset state
        this.pool = [];
        this.availableInstances = [];
        this.busyInstances.clear();
        this.isInitialized = false;
        this.isShuttingDown = false;

        console.log('DuckDB pool shutdown complete');
    }
}