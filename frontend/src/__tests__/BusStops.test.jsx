import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import App from '../App';

jest.mock('axios');

describe('Bus Stops Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should display bus stops when API call is successful', async () => {
    const mockStops = [
      { id: 'stop1', name: 'Central Station', lat: 49.77723, lon: 6.09528 },
      { id: 'stop2', name: 'Market Square', lat: 49.77824, lon: 6.09629 }
    ];

    axios.get.mockResolvedValueOnce({ data: mockStops });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Central Station')).toBeInTheDocument();
      expect(screen.getByText('Market Square')).toBeInTheDocument();
    });

    expect(axios.get).toHaveBeenCalledWith('http://localhost:3000/api/stops');
  });

  it('should handle API errors gracefully', async () => {
    axios.get.mockRejectedValueOnce(new Error('Failed to fetch stops'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Error fetching stops/i)).toBeInTheDocument();
    });
  });

  it('should filter stops based on search input', async () => {
    const mockStops = [
      { id: 'stop1', name: 'Central Station', lat: 49.77723, lon: 6.09528 },
      { id: 'stop2', name: 'Market Square', lat: 49.77824, lon: 6.09629 }
    ];

    axios.get.mockResolvedValueOnce({ data: mockStops });

    render(<App />);

    const stopIdInput = screen.getByLabelText(/Stop ID/i);
    userEvent.type(stopIdInput, 'stop1');

    await waitFor(() => {
      expect(screen.getByText('Central Station')).toBeInTheDocument();
      expect(screen.queryByText('Market Square')).not.toBeInTheDocument();
    });
  });
});