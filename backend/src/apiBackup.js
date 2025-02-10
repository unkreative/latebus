import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create permanent backup directory in project root
const backupDir = path.join(__dirname, '..', '..', 'api_backups');
if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
}

/**
 * Stores API response data in a backup file
 * @param {string} endpoint - The API endpoint (e.g., 'nearbystops', 'departureBoard')
 * @param {Object} data - The API response data
 */
export const storeApiResponse = (endpoint, data) => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toISOString().split('T')[1].replace(/:/g, '-').split('.')[0];
    
    // Create date-specific directory
    const dateDir = path.join(backupDir, dateStr);
    if (!fs.existsSync(dateDir)) {
        fs.mkdirSync(dateDir, { recursive: true });
    }

    // Create filename with timestamp and endpoint
    const filename = `${timeStr}_${endpoint}.json`;
    const filePath = path.join(dateDir, filename);

    // Store the response data
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    return filePath;
};