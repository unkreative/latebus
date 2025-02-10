import { useState, useEffect } from 'react';
import { Container, Paper, Typography, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tabs, Tab, Grid, CircularProgress, Card, CardContent, Chip, LinearProgress } from '@mui/material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, Label } from 'recharts';
import axios from 'axios';

function TabPanel({ children, value, index }) {
  return (
    <div hidden={value !== index} style={{ padding: '20px 0' }}>
      {value === index && children}
    </div>
  );
}

function App() {
  const [statistics, setStatistics] = useState([]);
  const [stopStatistics, setStopStatistics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const [routeAnalysis, setRouteAnalysis] = useState({});

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [statsResponse, stopsResponse, routeResponse] = await Promise.all([
        axios.get('http://localhost:3000/api/statistics'),
        axios.get('http://localhost:3000/api/stops/statistics'),
        axios.get('http://localhost:3000/api/route/analysis')
      ]);
      setStatistics(statsResponse.data);
      setStopStatistics(stopsResponse.data);
      setRouteAnalysis(routeResponse.data);
    } catch (error) {
      setError('Error fetching data');
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];

  if (loading) return <Container sx={{ py: 4, textAlign: 'center' }}><CircularProgress /></Container>;
  if (error) return <Container sx={{ py: 4 }}><Typography color="error">{error}</Typography></Container>;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Bus Statistics Dashboard
        </Typography>
        <Tabs value={tabValue} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tab label="Overview" />
          <Tab label="Stop Analysis" />
          <Tab label="Delay Patterns" />
          <Tab label="Route Analysis" />
        </Tabs>

        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={8}>
              <Box sx={{ height: 400 }}>
                <LineChart
                  width={800}
                  height={300}
                  data={statistics}
                  margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="line_name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="avg_delay" stroke="#8884d8" name="Average Delay" />
                </LineChart>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Summary Statistics</Typography>
                  <Typography>Total Stops: {stopStatistics.length}</Typography>
                  <Typography>Average System Delay: {Math.round(statistics.reduce((acc, curr) => acc + curr.avg_delay, 0) / statistics.length)} minutes</Typography>
                  <Typography>Total Departures: {statistics.reduce((acc, curr) => acc + curr.total_departures, 0)}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <TableContainer sx={{ mt: 4 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Line Name</TableCell>
                  <TableCell>Average Delay (minutes)</TableCell>
                  <TableCell>Total Departures</TableCell>
                  <TableCell>Delayed Departures</TableCell>
                  <TableCell>On-Time Performance</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {statistics.map((stat, index) => (
                  <TableRow key={index}>
                    <TableCell>{stat.line_name}</TableCell>
                    <TableCell>{Math.round(stat.avg_delay * 10) / 10}</TableCell>
                    <TableCell>{stat.total_departures}</TableCell>
                    <TableCell>{stat.delayed_departures}</TableCell>
                    <TableCell>{Math.round(((stat.total_departures - stat.delayed_departures) / stat.total_departures) * 100)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Top Delayed Stops</Typography>
              <BarChart
                width={500}
                height={300}
                data={stopStatistics.slice(0, 5)}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stop_name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="avg_delay" fill="#8884d8" name="Average Delay (minutes)" />
              </BarChart>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Delay Distribution by Stop</Typography>
              <PieChart width={400} height={300}>
                <Pie
                  data={stopStatistics.slice(0, 5)}
                  dataKey="delayed_departures"
                  nameKey="stop_name"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  label
                >
                  {stopStatistics.slice(0, 5).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </Grid>
          </Grid>

          <TableContainer sx={{ mt: 4 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Stop Name</TableCell>
                  <TableCell>Average Delay (minutes)</TableCell>
                  <TableCell>Total Departures</TableCell>
                  <TableCell>Delayed Departures</TableCell>
                  <TableCell>Peak Delay Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stopStatistics.map((stop, index) => (
                  <TableRow key={index}>
                    <TableCell>{stop.stop_name}</TableCell>
                    <TableCell>{Math.round(stop.avg_delay * 10) / 10}</TableCell>
                    <TableCell>{stop.total_departures}</TableCell>
                    <TableCell>{stop.delayed_departures}</TableCell>
                    <TableCell>{stop.peak_delay_time || 'N/A'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Delay Patterns by Time of Day</Typography>
              <LineChart
                width={500}
                height={300}
                data={statistics}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time_of_day" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="avg_delay" stroke="#8884d8" name="Average Delay" />
              </LineChart>
            </Grid>
            <Grid item xs={12} md={6}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Delay Analysis</Typography>
                  <Typography variant="body1" paragraph>
                    Peak Delay Hours: {statistics[0]?.peak_delay_hours || 'N/A'}
                  </Typography>
                  <Typography variant="body1" paragraph>
                    Most Affected Routes: {statistics[0]?.most_affected_routes || 'N/A'}
                  </Typography>
                  <Typography variant="body1">
                    System Reliability Score: {Math.round(statistics.reduce((acc, curr) => 
                      acc + ((curr.total_departures - curr.delayed_departures) / curr.total_departures) * 100, 0
                    ) / statistics.length)}%
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </TabPanel>
        <TabPanel value={tabValue} index={3}>
          <Grid container spacing={3}>
            {Object.entries(routeAnalysis).map(([direction, stops]) => {
              const sortedStops = [...stops].sort((a, b) => a.sequence - b.sequence);
              return (
                <Grid item xs={12} key={direction}>
                  <Card sx={{ mb: 4, p: 2 }}>
                    <Typography variant="h5" gutterBottom sx={{ color: 'primary.main', borderBottom: '2px solid', borderColor: 'primary.main', pb: 1 }}>
                      Direction: {direction}
                    </Typography>
                    
                    <Box sx={{ mb: 4 }}>
                      <Typography variant="h6" gutterBottom color="text.secondary">
                        Delay Progression Along Route
                      </Typography>
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={sortedStops} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis 
                            dataKey="stopName" 
                            angle={-45} 
                            textAnchor="end" 
                            height={80} 
                            interval={0}
                            tick={{ fontSize: 12 }}
                          />
                          <YAxis yAxisId="left" orientation="left" stroke="#8884d8">
                            <Label angle={-90} value="Average Delay (minutes)" position="insideLeft" style={{ textAnchor: 'middle' }} />
                          </YAxis>
                          <YAxis yAxisId="right" orientation="right" stroke="#82ca9d">
                            <Label angle={90} value="Delay Percentage (%)" position="insideRight" style={{ textAnchor: 'middle' }} />
                          </YAxis>
                          <Tooltip 
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <Paper sx={{ p: 1 }}>
                                    <Typography variant="subtitle2">{label}</Typography>
                                    {payload.map((entry, index) => (
                                      <Typography key={index} sx={{ color: entry.color }}>
                                        {entry.name}: {entry.value}{entry.name.includes('Percentage') ? '%' : ' min'}
                                      </Typography>
                                    ))}
                                  </Paper>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend />
                          <Line 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="avgDelay" 
                            stroke="#8884d8" 
                            name="Average Delay"
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            activeDot={{ r: 8 }}
                          />
                          <Line 
                            yAxisId="right"
                            type="monotone" 
                            dataKey="delayPercentage" 
                            stroke="#82ca9d" 
                            name="Delay Percentage"
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            activeDot={{ r: 8 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  
                  <Box sx={{ mb: 4 }}>
                    <Typography variant="h6" gutterBottom color="text.secondary">
                      Stop-by-Stop Analysis
                    </Typography>
                    <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
                      <Table stickyHeader>
                        <TableHead>
                          <TableRow>
                            <TableCell>Sequence</TableCell>
                            <TableCell>Stop Name</TableCell>
                            <TableCell align="right">
                              <Tooltip title="Average delay in minutes">
                                <span>Avg. Delay</span>
                              </Tooltip>
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="Number of recorded departures">
                                <span>Total Deps.</span>
                              </Tooltip>
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="Number of departures with delays">
                                <span>Delayed Deps.</span>
                              </Tooltip>
                            </TableCell>
                            <TableCell align="right">
                              <Tooltip title="Percentage of delayed departures">
                                <span>Delay %</span>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {sortedStops.map((stop) => (
                            <TableRow 
                              key={stop.stopId}
                              sx={{
                                backgroundColor: 
                                  stop.delayPercentage > 50 ? 'error.lighter' :
                                  stop.delayPercentage > 30 ? 'warning.lighter' :
                                  'inherit'
                              }}
                            >
                              <TableCell>{stop.sequence}</TableCell>
                              <TableCell>{stop.stopName}</TableCell>
                              <TableCell align="right">
                                <Chip 
                                  label={`${stop.avgDelay} min`}
                                  color={stop.avgDelay > 10 ? 'error' : stop.avgDelay > 5 ? 'warning' : 'success'}
                                  size="small"
                                />
                              </TableCell>
                              <TableCell align="right">{stop.totalDepartures.toLocaleString()}</TableCell>
                              <TableCell align="right">{stop.delayedDepartures.toLocaleString()}</TableCell>
                              <TableCell align="right">
                                <LinearProgress 
                                  variant="determinate" 
                                  value={stop.delayPercentage}
                                  sx={{ 
                                    width: 75,
                                    height: 10,
                                    borderRadius: 5,
                                    backgroundColor: 'grey.200',
                                    '& .MuiLinearProgress-bar': {
                                      backgroundColor: 
                                        stop.delayPercentage > 50 ? 'error.main' :
                                        stop.delayPercentage > 30 ? 'warning.main' :
                                        'success.main'
                                    }
                                  }}
                                />
                                <Typography variant="caption" sx={{ ml: 1 }}>
                                  {Math.round(stop.delayPercentage)}%
                                </Typography>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Box>
                
                  <Box>
                    <Typography variant="h6" gutterBottom color="text.secondary">
                      Direction Summary
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                          <CardContent>
                            <Typography variant="h6">Average Delay</Typography>
                            <Typography variant="h4">
                              {isNaN(sortedStops.reduce((acc, stop) => acc + stop.avgDelay, 0) / sortedStops.length) ? '0.0' : 
                               (sortedStops.reduce((acc, stop) => acc + stop.avgDelay, 0) / sortedStops.length).toFixed(1)} min
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ bgcolor: 'secondary.light', color: 'secondary.contrastText' }}>
                          <CardContent>
                            <Typography variant="h6">Total Stops</Typography>
                            <Typography variant="h4">{sortedStops.length}</Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                          <CardContent>
                            <Typography variant="h6">Most Delayed Stop</Typography>
                            <Typography variant="h4">
                              {sortedStops.reduce((max, stop) => stop.avgDelay > max.avgDelay ? stop : max, sortedStops[0]).stopName}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Card sx={{ bgcolor: 'error.light', color: 'error.contrastText' }}>
                          <CardContent>
                            <Typography variant="h6">Avg Delay %</Typography>
                            <Typography variant="h4">
                              {isNaN(sortedStops.reduce((acc, stop) => acc + stop.delayPercentage, 0) / sortedStops.length) ? '0.0' : 
                               (sortedStops.reduce((acc, stop) => acc + stop.delayPercentage, 0) / sortedStops.length).toFixed(1)}%
                            </Typography>
                          </CardContent>
                        </Card>
                      </Grid>
                    </Grid>
                  </Box>
                </Card>
              </Grid>
            )})}
          </Grid>
        </TabPanel>
      </Paper>
    </Container>
  );
}

export default App;