import app, { initDatabase, discoverBusStops, pool, fetchDepartures, storeDepartureData } from './app.js';
import dotenv from 'dotenv';
import cron from 'node-cron';

dotenv.config();

// Schedule data collection
cron.schedule('*/2 * * * *', async () => {
  console.log('[Cron] Starting scheduled data collection');
  const startTime = Date.now();
  try {
    // Check if we're in a quota exceeded state
    const now = new Date();
    const quotaExceededKey = 'quota_exceeded_until';
    const quotaExceededUntil = global[quotaExceededKey];

    if (quotaExceededUntil && now < new Date(quotaExceededUntil)) {
      console.log(`[Cron] API quota exceeded. Waiting until ${quotaExceededUntil} before resuming...`);
      return;
    }

    console.log('[Database] Fetching stops that serve bus line 321');
    const stops = await pool.query('SELECT DISTINCT s.id FROM stops s INNER JOIN departures d ON s.id = d.stop_id WHERE d.line_name = $1', [process.env.BUS_LINE]);
    console.log(`[Cron] Processing ${stops.rows.length} known bus stops`);

    let successCount = 0;
    let errorCount = 0;

    for (const stop of stops.rows) {
      try {
        console.log(`[External API] Fetching departures for stop ${stop.id}`);
        const departures = await fetchDepartures(stop.id);
        if (departures.Departure) {
          const relevantDepartures = departures.Departure.filter(d => 
            d.ProductAtStop?.line === process.env.BUS_LINE || 
            d.Product?.[0]?.line === process.env.BUS_LINE
          );
          console.log(`[Cron] Found ${relevantDepartures.length} departures for bus line ${process.env.BUS_LINE} at stop ${stop.id}`);
          
          for (const departure of relevantDepartures) {
            await storeDepartureData(departure, stop.id);
            successCount++;
          }
        }
      } catch (stopError) {
        if (stopError.message.includes('API quota exceeded')) {
          // Set the quota exceeded flag until the start of next hour
          const nextHour = new Date();
          nextHour.setHours(nextHour.getHours() + 1);
          nextHour.setMinutes(0);
          nextHour.setSeconds(0);
          nextHour.setMilliseconds(0);
          
          global[quotaExceededKey] = nextHour;
          console.log(`[Cron] Both API keys quota exceeded. Pausing until ${nextHour}`);
          return;
        }
        console.error(`[Cron] Error processing stop ${stop.id}:`, stopError.message);
        errorCount++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[Cron] Data collection completed in ${duration}ms. Successfully processed ${successCount} departures. Errors: ${errorCount}`);
  } catch (error) {
    console.error('[Cron] Error during data collection:', error);
    console.error('[Cron] Error stack:', error.stack);
  }
});

// Initialize database and start server
initDatabase()
  .then(async () => {
    // Check if stops table is empty or if we have any departures
    const [stopsResult, departuresResult] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM stops'),
      pool.query('SELECT COUNT(*) FROM departures')
    ]);
    
    const stopCount = parseInt(stopsResult.rows[0].count);
    const departureCount = parseInt(departuresResult.rows[0].count);
    
    if (stopCount === 0 || departureCount === 0) {
      console.log('[Init] No stops or departures found in database, running initial discovery...');
      await discoverBusStops();
      
      // Fetch initial departure data for discovered stops
      const stops = await pool.query('SELECT id FROM stops');
      console.log(`[Init] Fetching initial departure data for ${stops.rows.length} stops...`);
      
      for (const stop of stops.rows) {
        try {
          const departures = await fetchDepartures(stop.id);
          if (departures.Departure) {
            const relevantDepartures = departures.Departure.filter(d => 
              d.ProductAtStop?.line === process.env.BUS_LINE || 
              d.Product?.[0]?.line === process.env.BUS_LINE
            );
            
            for (const departure of relevantDepartures) {
              await storeDepartureData(departure, stop.id);
            }
          }
        } catch (error) {
          console.error(`[Init] Error fetching departures for stop ${stop.id}:`, error.message);
        }
      }
    } else {
      console.log(`[Init] Found ${stopCount} existing stops and ${departureCount} departures, skipping discovery...`);
    }
  })
  .then(() => {
    app.listen(3000, () => {
      console.log('Server running on port 3000');
    });
  });