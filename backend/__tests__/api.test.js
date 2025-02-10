import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../src/app.js';
import { pool } from '../src/app.js';

describe('API Endpoints', () => {
  beforeAll(async () => {
    // Setup test database
    await pool.query(`
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
        scheduled_time TIMESTAMP,
        actual_time TIMESTAMP,
        delay_minutes INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    // Clear tables before each test
    await pool.query('DELETE FROM departures');
    await pool.query('DELETE FROM stops');
  });

  describe('GET /api/stops', () => {
    it('should return all stops', async () => {
      // Insert test data
      await pool.query(
        'INSERT INTO stops (id, name, lat, lon) VALUES ($1, $2, $3, $4)',
        ['stop1', 'Test Stop', 49.77723, 6.09528]
      );

      const response = await request(app).get('/api/stops');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toHaveProperty('id', 'stop1');
    });
  });
});