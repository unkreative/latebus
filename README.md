# Bus Statistics Tracking System

A real-time bus tracking system that monitors and displays statistics for public transportation in Luxembourg. The system integrates with the Luxembourg public transport API to provide live bus arrival and departure information.

## Project Architecture

The project consists of three main components:

### Frontend (React)
- Built with React and Vite
- Material-UI components for modern UI
- Real-time data visualization using Recharts
- Responsive design for desktop and mobile devices

### Backend (Node.js)
- Express.js server
- Real-time bus data fetching using node-cron
- PostgreSQL database integration
- RESTful API endpoints

### Database (PostgreSQL)
- Stores historical bus data
- Maintains schedule and real-time arrival information
- Optimized for time-series data

## Prerequisites

- Docker and Docker Compose
- Node.js (for local development)

## Setup and Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd opbus
```

2. Create environment files:

Backend (.env):
```env
DATABASE_URL=postgresql://busapp:buspass123@postgres:5432/busstats
PRIMARY_API_KEY=your_api_key
BUS_LINE=321
NODE_ENV=development
```

3. Start the application:
```bash
docker-compose up --build
```

The services will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:3000
- PostgreSQL: localhost:5432

## API Documentation

### Luxembourg Transport API Integration

The system integrates with two main API endpoints:

1. Nearby Stops API
```
https://cdt.hafas.de/opendata/apiserver/location.nearbystops
```
Parameters:
- accessId: API key
- originCoordLong: Longitude
- originCoordLat: Latitude
- maxNo: Maximum number of stops
- r: Radius in meters

2. Departure Board API
```
https://cdt.hafas.de/opendata/apiserver/departureBoard
```
Parameters:
- accessId: API key
- id: Stop ID
- format: Response format (json/xml)

## Development

### Frontend Development
```bash
cd frontend
npm install
npm run dev
```

### Backend Development
```bash
cd backend
npm install
npm run dev
```

## Testing

### Frontend Tests
```bash
cd frontend
npm test
```

### Backend Tests
```bash
cd backend
npm test
```

## Docker Configuration

The application uses Docker Compose with three services:

1. PostgreSQL
- Image: postgres:15-alpine
- Persistent volume for data storage
- Health checks configured

2. Backend
- Custom Dockerfile
- Node.js environment
- Depends on PostgreSQL service

3. Frontend
- Custom Dockerfile
- Vite for development and production builds
- Depends on Backend service

## Project Structure

```
├── backend/
│   ├── src/
│   ├── __tests__/
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.