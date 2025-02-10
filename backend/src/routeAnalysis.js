import { pool } from './app.js';

export async function getRouteDelayAnalysis() {
  const client = await pool.connect();
  try {
    // Query to get delays by stop, ordered by direction and sequence
    const result = await client.query(`
      WITH FirstScheduledTimes AS (
        SELECT 
          d.stop_id,
          d.direction_flag,
          MIN(d.scheduled_time) as first_time
        FROM departures d
        WHERE d.line_name = $1
        GROUP BY d.stop_id, d.direction_flag
      ),
      StopSequence AS (
        SELECT 
          f.stop_id,
          s.name as stop_name,
          f.direction_flag,
          ROW_NUMBER() OVER (PARTITION BY f.direction_flag ORDER BY f.first_time) as stop_sequence
        FROM FirstScheduledTimes f
        JOIN stops s ON f.stop_id = s.id
      )
      SELECT 
        ss.direction_flag,
        ss.stop_sequence,
        ss.stop_id,
        ss.stop_name,
        ROUND(AVG(d.delay_minutes)::numeric, 1) as avg_delay,
        COUNT(*) as total_departures,
        COUNT(CASE WHEN d.delay_minutes > 5 THEN 1 END) as delayed_departures,
        ROUND((COUNT(CASE WHEN d.delay_minutes > 5 THEN 1 END)::numeric / COUNT(*)::numeric * 100), 1) as delay_percentage
      FROM StopSequence ss
      JOIN departures d ON ss.stop_id = d.stop_id AND ss.direction_flag = d.direction_flag
      WHERE d.line_name = $1
      GROUP BY ss.direction_flag, ss.stop_sequence, ss.stop_id, ss.stop_name
      ORDER BY ss.direction_flag, ss.stop_sequence;
    `, [process.env.BUS_LINE]);

    // Transform the data to group by direction
    const analysis = result.rows.reduce((acc, row) => {
      const direction = row.direction_flag || 'unknown';
      if (!acc[direction]) {
        acc[direction] = [];
      }
      acc[direction].push({
        sequence: row.stop_sequence,
        stopId: row.stop_id,
        stopName: row.stop_name,
        avgDelay: row.avg_delay,
        totalDepartures: row.total_departures,
        delayedDepartures: row.delayed_departures,
        delayPercentage: row.delay_percentage
      });
      return acc;
    }, {});

    return analysis;
  } finally {
    client.release();
  }
}