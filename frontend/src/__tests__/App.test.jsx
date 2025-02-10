import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import App from '../App';

jest.mock('axios');

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render loading state initially', () => {
    render(<App />);
    expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
  });

  it('should display stops data when loaded', async () => {
    const mockStops = [
      { id: 'stop1', name: 'Test Stop 1', lat: 49.77723, lon: 6.09528 }
    ];

    axios.get.mockResolvedValueOnce({ data: mockStops });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Test Stop 1')).toBeInTheDocument();
    });
  });

  it('should display error message when API fails', async () => {
    axios.get.mockRejectedValueOnce(new Error('Failed to fetch'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading data/i)).toBeInTheDocument();
    });
  });

  it('should filter departures by date range', async () => {
    const mockDepartures = [
      {
        id: 1,
        stop_id: 'stop1',
        line_name: '321',
        scheduled_time: '2023-10-20T10:00:00',
        actual_time: '2023-10-20T10:05:00',
        delay_minutes: 5
      }
    ];

    axios.get.mockResolvedValueOnce({ data: mockDepartures });

    render(<App />);

    const dateInput = screen.getByLabelText(/Select date range/i);
    userEvent.click(dateInput);

    await waitFor(() => {
      expect(screen.getByText('5 minutes delay')).toBeInTheDocument();
    });
  });

  it('should display statistics correctly', async () => {
    const mockStats = [
      {
        line_name: '321',
        avg_delay: 7.5,
        total_departures: 100,
        delayed_departures: 25
      }
    ];

    axios.get.mockResolvedValueOnce({ data: mockStats });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Average Delay: 7.5 minutes/i)).toBeInTheDocument();
      expect(screen.getByText(/Total Departures: 100/i)).toBeInTheDocument();
      expect(screen.getByText(/Delayed Departures: 25/i)).toBeInTheDocument();
    });
  });
});