import express from 'express';
import cors from 'cors';
import pg from 'pg';
import cron from 'node-cron';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import https from 'https';
import { storeApiResponse } from './apiBackup.js';
import { getRouteDelayAnalysis } from './routeAnalysis.js';

// Fetch with retry implementation
async function fetchWithRetry(url, options = {}, maxRetries = 3, initialDelay = 1000) {
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        timeout: 10000, // 10 second timeout
        agent: new https.Agent({
          rejectUnauthorized: false
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return { data, response };
    } catch (error) {
      lastError = error;
      console.error(`[External API] Attempt ${attempt + 1} failed:`, error.message);
      
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt); // Exponential backoff
        console.log(`[External API] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Add adaptive polling configuration
const HOURLY_REQUEST_LIMIT = 800; // Combined limit for both API keys
const STOPS_PER_HOUR = 20; // Number of bus stops to monitor
const MIN_POLL_INTERVAL = 5 * 60 * 1000; // Minimum 5 minutes between checks
const MAX_POLL_INTERVAL = 30 * 60 * 1000; // Maximum 30 minutes between checks

// Initialize polling for monitored stops
let monitoredStops = new Map(); // Store stop IDs and their next poll time

// Calculate adaptive polling interval based on historical delays
async function calculatePollingInterval(stopId) {
  const client = await pool.connect();
  try {
    // Get average delay and standard deviation for the last 24 hours
    const stats = await client.query(`
      SELECT 
        AVG(delay_minutes) as avg_delay,
        STDDEV(delay_minutes) as std_delay,
        COUNT(*) as sample_size
      FROM departures
      WHERE stop_id = $1
      AND created_at > NOW() - INTERVAL '24 hours'
    `, [stopId]);

    const { avg_delay = 0, std_delay = 0, sample_size = 0 } = stats.rows[0];

    // If we don't have enough data, use default interval
    if (sample_size < 5) {
      return MAX_POLL_INTERVAL;
    }

    // Calculate base interval based on delay patterns
    let interval = MIN_POLL_INTERVAL;
    
    // Increase interval if delays are consistently low
    if (avg_delay < 5 && std_delay < 3) {
      interval = MAX_POLL_INTERVAL;
    } else if (avg_delay < 10 && std_delay < 5) {
      interval = (MIN_POLL_INTERVAL + MAX_POLL_INTERVAL) / 2;
    }

    // Adjust for time of day (more frequent during peak hours)
    const hour = new Date().getHours();
    const isPeakHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 18);
    if (isPeakHour) {
      interval = Math.max(interval / 2, MIN_POLL_INTERVAL);
    }

    return interval;
  } finally {
    client.release();
  }
}

dotenv.config();

const app = express();
app.use(cors());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});
app.use(express.json());

// Database connection
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

// Track API quota status
let isApiQuotaExhausted = false;
let quotaResetTime = null;

// Initialize database tables
export async function initDatabase() {
  const client = await pool.connect();
  try {
    // First check if tables exist
    const tablesExist = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'stops'
      ) AND EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'departures'
      );
    `);

    if (!tablesExist.rows[0].exists) {
      console.log('[Database] Tables do not exist, creating schema...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS stops (
          id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          lat DECIMAL(9,6),
          lon DECIMAL(9,6)
        );

        CREATE TABLE IF NOT EXISTS departures (
          id SERIAL PRIMARY KEY,
          stop_id VARCHAR(255) REFERENCES stops(id),
          line_name VARCHAR(255),
          display_number VARCHAR(255),
          internal_name VARCHAR(255),
          scheduled_time TIMESTAMP,
          actual_time TIMESTAMP,
          delay_minutes INTEGER,
          operator VARCHAR(255),
          operator_short VARCHAR(50),
          journey_ref VARCHAR(255),
          journey_status VARCHAR(50),
          direction VARCHAR(255),
          direction_flag VARCHAR(10),
          category_code VARCHAR(50),
          category_out VARCHAR(50),
          category_in VARCHAR(50),
          icon_fg_color VARCHAR(7),
          icon_bg_color VARCHAR(7),
          reachable BOOLEAN,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('[Database] Schema created successfully');
    } else {
      console.log('[Database] Tables already exist, skipping schema creation');
    }
  } finally {
    client.release();
  }
}

// Fetch stops data
export async function fetchStops() {
  trackApiRequest();
  console.log('[External API] Fetching stops from HAFAS API');
  const startTime = Date.now();
  try {
    const result = await fetchWithRetry(
      `https://cdt.hafas.de/opendata/apiserver/location.nearbystops?accessId=${currentApiKey}&originCoordLong=6.241150&originCoordLat=49.664757&maxNo=3000&r=3000&format=json`
    );
    
    const duration = Date.now() - startTime;
    console.log(`[External API] HAFAS API response received in ${duration}ms`);
    
    // Store API response for backup
    await storeApiResponse('nearbystops', result.data);
    console.log(`[External API] Successfully parsed JSON response with ${result.data.stopLocationOrCoordLocation?.length || 0} locations`);
    return result.data;
  } catch (error) {
    console.error('[External API] Error fetching stops:', error);
    console.error('[External API] Error stack:', error.stack);
    throw error;
  }
}

// Fetch departure data for a stop
// API Key Management
let currentApiKey = process.env.PRIMARY_API_KEY;
let backupApiKey = process.env.SECONDARY_API_KEY;
let requestsThisHour = 0;
const MAX_REQUESTS_PER_HOUR = 800;

// Function to rotate API keys
function rotateApiKeys() {
  [currentApiKey, backupApiKey] = [backupApiKey, currentApiKey];
  console.log('[API Key] Rotated to backup API key');
  requestsThisHour = 0;
}

// Function to track API requests
function trackApiRequest() {
  requestsThisHour++;
  if (requestsThisHour >= MAX_REQUESTS_PER_HOUR) {
    rotateApiKeys();
  }
}

export async function fetchDepartures(stopId, busLine = null) {
  trackApiRequest();
  const lineParam = busLine ? `&lines=${busLine}` : '';
  try {
    const result = await fetchWithRetry(
      `https://cdt.hafas.de/opendata/apiserver/departureBoard?accessId=${currentApiKey}&lang=fr&id=${stopId}${lineParam}&format=json`
    );
    return result.data;
  } catch (error) {
    console.error(`[External API] Error fetching departures for stop ${stopId}:`, error);
    throw error;
  }
}



// Store departure data
export async function storeDepartureData(departure, stopId) {
  const client = await pool.connect();
  try {
    const scheduledTime = `${departure.date} ${departure.time}`;
    const actualTime = departure.rtDate && departure.rtTime ? 
      `${departure.rtDate} ${departure.rtTime}` : scheduledTime;

    // Extract product information
    const product = departure.ProductAtStop || departure.Product?.[0] || {};
    const icon = product.icon || {};

    // Extract operator information
    const operatorInfo = product.operatorInfo || {};
    const operator = operatorInfo.name || 'Unknown';
    const operatorShort = operatorInfo.nameS || '';

    await client.query(
      `INSERT INTO departures (
        stop_id,
        line_name,
        display_number,
        internal_name,
        scheduled_time,
        actual_time,
        delay_minutes,
        operator,
        operator_short,
        journey_ref,
        journey_status,
        direction,
        direction_flag,
        category_code,
        category_out,
        category_in,
        icon_fg_color,
        icon_bg_color,
        reachable
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
      [
        stopId,
        product.line,
        product.displayNumber,
        product.internalName,
        new Date(scheduledTime),
        new Date(actualTime),
        departure.rtTime ? Math.round((new Date(actualTime) - new Date(scheduledTime)) / 60000) : 0,
        operator,
        operatorShort,
        departure.JourneyDetailRef?.ref,
        departure.JourneyStatus || 'Unknown',
        departure.direction || '',
        departure.directionFlag || '',
        product.catCode,
        product.catOut,
        product.catIn,
        icon.foregroundColor?.hex || '',
        icon.backgroundColor?.hex || '',
        departure.reachable || false
      ]
    );
  } finally {
    client.release();
  }
}

// Check if a stop is served by our bus line and store departures
export async function checkStopForBusLine(stop) {
  try {
    const client = await pool.connect();
    try {

      // Check if stop exists first
      const existingStop = await client.query('SELECT id FROM stops WHERE id = $1', [stop.id]);
      if (existingStop.rows.length === 0) {
        console.log(`[Discovery] New stop ${stop.id} found, storing data...`);
        await storeStopData(stop);
      } else {
        console.log(`[Discovery] Stop ${stop.id} already exists, skipping storage...`);
      }
    } finally {
      client.release();
    }
    
    // Only make API call if we don't know if this stop serves our line
    const departures = await fetchDepartures(stop.id);
    const relevantDepartures = departures.Departure?.filter(departure => 
      departure.ProductAtStop?.line === process.env.BUS_LINE || 
      departure.Product?.[0]?.line === process.env.BUS_LINE
    ) || [];

    // Store all relevant departures
    for (const departure of relevantDepartures) {
      try {
        await storeDepartureData(departure, stop.id);
      } catch (error) {
        console.error(`[Database] Error storing departure for stop ${stop.id}:`, error);
      }
    }

    return relevantDepartures.length > 0;
  } catch (error) {
    console.error(`[Error] Processing stop ${stop.id}:`, error);
    throw error;
  }
}

// Store stop data
export async function storeStopData(stop) {
  console.log(`[Database] Storing stop data for stop ID: ${stop.id}`);
  
  // Validate required fields
  if (!stop.id || !stop.name) {
    throw new Error('Stop ID and name are required');
  }

  // Extract and validate coordinates
  const lat = stop.coord?.lat ?? null;
  const lon = stop.coord?.long ?? null;

  console.log(`[Database] Coordinates for stop ${stop.id}: lat=${lat}, lon=${lon}`);
  
  const client = await pool.connect();
  const startTime = Date.now();
  try {
    await client.query(
      `INSERT INTO stops (id, name, lat, lon)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE
       SET name = $2, lat = $3, lon = $4`,
      [stop.id, stop.name, lat, lon]
    );
    const duration = Date.now() - startTime;
    console.log(`[Database] Successfully stored stop data in ${duration}ms`);
  } catch (error) {
    console.error(`[Database] Error storing stop data for ID ${stop.id}:`, error);
    console.error('[Database] Error stack:', error.stack);
    throw error;
  } finally {
    client.release();
    console.log('[Database] Released client connection');
  }
}

// Discover and store stops for our bus line
export async function discoverBusStops() {
  console.log('[Discovery] Starting bus stop discovery process');
  const BATCH_SIZE = 5; // Reduced batch size to avoid overwhelming the API
  const MAX_CONCURRENT_REQUESTS = 2; // Reduced concurrent requests
  
  try {
    const stopsData = await fetchStops();
    if (!stopsData.stopLocationOrCoordLocation) {
      console.log('[Discovery] No stops found in the API response');
      return;
    }

    const stops = stopsData.stopLocationOrCoordLocation
      .filter(location => location.StopLocation)
      .map(location => location.StopLocation);

    console.log(`[Discovery] Processing ${stops.length} locations in batches of ${BATCH_SIZE}`);
    let discoveredStops = 0;
    let failedStops = 0;

    // Process stops in batches
    for (let i = 0; i < stops.length; i += BATCH_SIZE) {
      if (requestsThisHour >= MAX_REQUESTS_PER_HOUR) {
        console.log('[Discovery] API quota reached, pausing discovery process...');
        const now = new Date();
        const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
        const waitTime = nextHour.getTime() - now.getTime();
        await new Promise(resolve => setTimeout(resolve, waitTime));
        requestsThisHour = 0;
      }

      const batch = stops.slice(i, i + BATCH_SIZE);
      const batchPromises = [];

      // Process each stop in the batch
      for (const stop of batch) {
        const promise = (async () => {
          try {
            console.log(`[Discovery] Checking stop ${stop.id} (${stop.name}) for bus line ${process.env.BUS_LINE}`);
            const isServedByBusLine = await checkStopForBusLine(stop);
            
            if (isServedByBusLine) {
              console.log(`[Discovery] Stop ${stop.id} is served by bus line ${process.env.BUS_LINE}, storing...`);
              await storeStopData(stop);
              discoveredStops++;
            }
          } catch (stopError) {
            console.error(`[Discovery] Error processing stop ${stop.id}:`, stopError.message);
            failedStops++;
          }
        })();

        batchPromises.push(promise);

        // If we've reached the concurrent request limit, wait for some to complete
        if (batchPromises.length >= MAX_CONCURRENT_REQUESTS) {
          await Promise.all(batchPromises);
          batchPromises.length = 0;
          // Add a longer delay between concurrent request batches
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Wait for any remaining promises in the batch
      if (batchPromises.length > 0) {
        await Promise.all(batchPromises);
      }

      // Add a longer delay between batches to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log(`[Discovery] Bus stop discovery completed. Found ${discoveredStops} stops for bus line ${process.env.BUS_LINE}. Failed to process ${failedStops} stops.`);
  } catch (error) {
    console.error('[Discovery] Error during bus stop discovery:', error.message);
    throw error;
  }
}

// API Routes
app.get('/api/stops', async (req, res) => {
  console.log('[API] GET /api/stops - Request received');
  try {
    console.log('[Database] Executing query: SELECT * FROM stops');
    const startTime = Date.now();
    const result = await pool.query('SELECT * FROM stops ORDER BY name');
    const duration = Date.now() - startTime;
    console.log(`[Database] Query completed in ${duration}ms. Found ${result.rows.length} stops`);
    
    // Only trigger stop discovery if no stops are found and force_refresh query param is true
    if (result.rows.length === 0 && req.query.force_refresh === 'true') {
      console.log('[API] No stops found in database and force_refresh requested. Starting discovery...');
      await discoverBusStops();
      const updatedResult = await pool.query('SELECT * FROM stops ORDER BY name');
      res.json(updatedResult.rows);
    } else {
      res.json(result.rows);
    }
  } catch (error) {
    console.error('[API] Error in /api/stops:', error);
    console.error('[API] Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/departures', async (req, res) => {
  console.log('[API] GET /api/departures - Request received', { query: req.query });
  try {
    const { stopId, lineId, startDate, endDate } = req.query;
    let query = `
      SELECT *
      FROM departures
      WHERE created_at BETWEEN $1 AND $2
    `;
    const params = [startDate || '1970-01-01', endDate || new Date()];

    if (stopId) {
      query += ' AND stop_id = $' + (params.length + 1);
      params.push(stopId);
    }
    if (lineId) {
      query += ' AND line_name = $' + (params.length + 1);
      params.push(lineId);
    }

    query += ' ORDER BY scheduled_time DESC';

    console.log('[Database] Executing departures query:', { query, params });
    const startTime = Date.now();
    const result = await pool.query(query, params);
    const duration = Date.now() - startTime;
    console.log(`[Database] Query completed in ${duration}ms. Found ${result.rows.length} departures`);

    res.json(result.rows);
  } catch (error) {
    console.error('[API] Error in /api/departures:', error);
    console.error('[API] Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/stops/statistics', async (req, res) => {
  console.log('[API] GET /api/stops/statistics - Request received');
  try {
    const result = await pool.query(`
      SELECT 
        s.id,
        s.name as stop_name,
        ROUND(AVG(d.delay_minutes)::numeric, 1) as avg_delay,
        COUNT(*) as total_departures,
        COUNT(CASE WHEN d.delay_minutes > 1 THEN 1 END) as delayed_departures,
        MODE() WITHIN GROUP (ORDER BY date_trunc('hour', d.scheduled_time)) as peak_delay_time
      FROM stops s
      JOIN departures d ON s.id = d.stop_id
      GROUP BY s.id, s.name
      ORDER BY avg_delay DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('[API] Error in /api/stops/statistics:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/statistics', async (req, res) => {
  console.log('[API] GET /api/statistics - Request received', { query: req.query });
  try {
    const { stopId, lineId, startDate, endDate } = req.query;
    let query = `
      SELECT 
        line_name,
        AVG(delay_minutes) as avg_delay,
        COUNT(*) as total_departures,
        COUNT(*) FILTER (WHERE delay_minutes > 0) as delayed_departures
      FROM departures
      WHERE created_at BETWEEN $1 AND $2
    `;
    const params = [startDate || '1970-01-01', endDate || new Date()];

    if (stopId) {
      query += ' AND stop_id = $' + (params.length + 1);
      params.push(stopId);
    }
    if (lineId) {
      query += ' AND line_name = $' + (params.length + 1);
      params.push(lineId);
    }

    query += ' GROUP BY line_name';

    console.log('[Database] Executing statistics query:', { query, params });
    const startTime = Date.now();
    const result = await pool.query(query, params);
    const duration = Date.now() - startTime;
    console.log(`[Database] Query completed in ${duration}ms. Found statistics for ${result.rows.length} bus lines`);

    res.json(result.rows);
  } catch (error) {
    console.error('[API] Error in /api/statistics:', error);
    console.error('[API] Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

app.get('/api/route/analysis', async (req, res) => {
  try {
    const analysis = await getRouteDelayAnalysis();
    res.json(analysis);
  } catch (error) {
    console.error('[API] Error getting route analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start monitoring bus stops
async function checkApiQuota() {
  try {
    // Try a simple API call to check quota
    await fetchStops();
    isApiQuotaExhausted = false;
    quotaResetTime = null;
    return true;
  } catch (error) {
    if (error.isQuotaError) {
      isApiQuotaExhausted = true;
      // Set reset time to the next hour
      const now = new Date();
      quotaResetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
      console.log(`[API] Quota exhausted. Waiting until ${quotaResetTime.toLocaleTimeString()}`);
      return false;
    }
    throw error;
  }
}

async function startMonitoring() {
  console.log('[Monitoring] Starting bus stop monitoring system');
  
  // Check API quota before starting
  while (!(await checkApiQuota())) {
    const waitTime = quotaResetTime.getTime() - Date.now();
    if (waitTime > 0) {
      console.log(`[API] Waiting ${Math.ceil(waitTime/1000)} seconds for quota reset...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  console.log('[Monitoring] API quota available, proceeding with monitoring...');
  
  // Get all stops that serve our bus line
  const result = await pool.query(
    'SELECT DISTINCT stop_id FROM departures WHERE line_name = $1',
    [process.env.BUS_LINE]
  );

  // Initialize monitoring for each stop
  for (const row of result.rows) {
    monitoredStops.set(row.stop_id, {
      nextPollTime: Date.now(),
      interval: MAX_POLL_INTERVAL
    });
  }

  // Start the monitoring loop
  setInterval(async () => {
    const now = Date.now();
    
    for (const [stopId, data] of monitoredStops) {
      if (now >= data.nextPollTime) {
        try {
          // Fetch new departures
          const departures = await fetchDepartures(stopId);
          
          // Store departures
          if (departures.Departure) {
            for (const departure of departures.Departure) {
              await storeDepartureData(departure, stopId);
            }
          }
          
          // Calculate new polling interval
          const newInterval = await calculatePollingInterval(stopId);
          
          // Update next poll time
          monitoredStops.set(stopId, {
            nextPollTime: now + newInterval,
            interval: newInterval
          });
          
        } catch (error) {
          console.error(`[Monitoring] Error polling stop ${stopId}:`, error);
          // On error, increase interval to reduce load
          monitoredStops.set(stopId, {
            nextPollTime: now + MAX_POLL_INTERVAL,
            interval: MAX_POLL_INTERVAL
          });
        }
      }
    }
  }, MIN_POLL_INTERVAL);
}

// Initialize database and start monitoring
initDatabase().then(() => {
  console.log('[Server] Database initialized');
  startMonitoring().then(() => {
    console.log('[Server] Bus stop monitoring system started');
  }).catch(error => {
    console.error('[Server] Failed to start monitoring:', error);
  });
}).catch(error => {
  console.error('[Server] Database initialization failed:', error);
});

export default app;