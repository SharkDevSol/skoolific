import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from '../Finance/PaymentManagement.module.css';

const API_URL = import.meta.env.VITE_API_URL || '';

const DeviceStatus = () => {
  const [devices, setDevices] = useState([]);
  const [serverPort, setServerPort] = useState(null);
  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);

  useEffect(() => {
    fetchDeviceStatus();
    // Refresh every 5 seconds
    const interval = setInterval(fetchDeviceStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchDeviceStatus = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.get(
        `${API_URL}/api/hr/devices/status`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setDevices(response.data.devices);
        if (response.data.serverPort) {
          setServerPort(response.data.serverPort);
        }
        if (response.data.branch) {
          setBranch(response.data.branch);
        }
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching device status:', error);
      setError(error.message);
      setLoading(false);
    }
  };

  const testAttendanceLog = async () => {
    setTestLoading(true);
    setTestResult(null);
    
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/hr/devices/test-log`,
        {
          machineId: '999',
          name: 'Test User',
          scanTime: new Date().toISOString().slice(0, 19).replace('T', ' ')
        },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      
      if (response.data.success) {
        setTestResult({
          type: 'success',
          message: '✅ Test attendance log processed successfully! Check the attendance system.'
        });
      }
    } catch (error) {
      console.error('Error testing attendance log:', error);
      setTestResult({
        type: 'error',
        message: `❌ Test failed: ${error.response?.data?.error || error.message}`
      });
    } finally {
      setTestLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h1>🔌 Device Connection Status</h1>
        </div>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <div className={styles.spinner}></div>
          <p>Loading device status...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>🔌 AI06 Device Connection Status</h1>
          <p>Monitor biometric attendance machine connections</p>
        </div>
        <button 
          onClick={fetchDeviceStatus}
          className={styles.primaryButton}
          style={{ marginLeft: 'auto' }}
        >
          🔄 Refresh
        </button>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '20px',
        marginBottom: '30px'
      }}>
        <div style={{
          padding: '24px',
          background: devices.length > 0 ? '#e8f5e9' : '#ffebee',
          borderRadius: '12px',
          border: `2px solid ${devices.length > 0 ? '#4caf50' : '#f44336'}`
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            WebSocket Server
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px' }}>
            {devices.length > 0 ? '✅ Running' : '❌ No Devices'}
          </div>
          <div style={{ fontSize: '13px', color: '#666' }}>
            Port: {serverPort || '—'}
          </div>
          <div style={{ fontSize: '13px', color: '#666', marginTop: '4px' }}>
            Branch: {branch || '—'}
          </div>
        </div>

        <div style={{
          padding: '24px',
          background: '#e3f2fd',
          borderRadius: '12px',
          border: '2px solid #2196f3'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            Connected Devices
          </div>
          <div style={{ fontSize: '32px', fontWeight: 700, marginBottom: '8px', color: '#1976d2' }}>
            {devices.length}
          </div>
          <div style={{ fontSize: '13px', color: '#666' }}>
            Active connections
          </div>
        </div>

        <div style={{
          padding: '24px',
          background: '#fff3e0',
          borderRadius: '12px',
          border: '2px solid #ff9800'
        }}>
          <div style={{ fontSize: '14px', color: '#666', marginBottom: '8px' }}>
            Last Update
          </div>
          <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: '#f57c00' }}>
            {new Date().toLocaleTimeString()}
          </div>
          <div style={{ fontSize: '13px', color: '#666' }}>
            Auto-refresh: 5s
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          padding: '16px',
          background: '#ffebee',
          border: '2px solid #f44336',
          borderRadius: '8px',
          marginBottom: '20px',
          color: '#c62828'
        }}>
          ⚠️ Error: {error}
        </div>
      )}

      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ marginBottom: '20px', fontSize: '18px' }}>📱 Connected Devices</h2>
        
        {devices.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '40px',
            color: '#666'
          }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📴</div>
            <h3>No Devices Connected</h3>
            <p style={{ marginTop: '12px', fontSize: '14px' }}>
              Make sure your AI06 machine is configured with:
            </p>
            <div style={{
              marginTop: '16px',
              padding: '16px',
              background: '#f5f5f5',
              borderRadius: '8px',
              textAlign: 'left',
              maxWidth: '400px',
              margin: '16px auto'
            }}>
              <div style={{ marginBottom: '8px' }}>
                <strong>Server IP:</strong> {window.location.hostname}
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Server Port:</strong> {serverPort || '—'}
              </div>
              <div>
                <strong>Protocol:</strong> WebSocket
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {devices.map((device, index) => (
              <div
                key={index}
                style={{
                  padding: '16px',
                  background: '#f8f9fa',
                  borderRadius: '8px',
                  border: '2px solid #4caf50',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
              >
                <div style={{
                  width: '48px',
                  height: '48px',
                  background: '#4caf50',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '24px'
                }}>
                  📱
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>
                    {device.name || `Device ${index + 1}`}
                  </div>
                  <div style={{ fontSize: '13px', color: '#666' }}>
                    Serial: {device.serialNumber || 'Unknown'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#666' }}>
                    Branch: {device.branch || '—'}
                  </div>
                  {device.model && (
                    <div style={{ fontSize: '13px', color: '#666' }}>
                      Model: {device.model}
                    </div>
                  )}
                </div>
                <div style={{
                  padding: '8px 16px',
                  background: '#4caf50',
                  color: 'white',
                  borderRadius: '20px',
                  fontSize: '13px',
                  fontWeight: 600
                }}>
                  ✅ Connected
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{
        marginTop: '24px',
        padding: '20px',
        background: '#fff3e0',
        borderRadius: '12px',
        border: '2px solid #ff9800'
      }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px', color: '#f57c00' }}>
          🧪 Test Attendance Log Processing
        </h3>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
          Click the button below to send a test attendance log and verify the system is processing logs correctly.
        </p>
        <button
          onClick={testAttendanceLog}
          disabled={testLoading}
          className={styles.primaryButton}
          style={{ marginBottom: '12px' }}
        >
          {testLoading ? '⏳ Testing...' : '🧪 Send Test Log'}
        </button>
        
        {testResult && (
          <div style={{
            marginTop: '12px',
            padding: '12px',
            background: testResult.type === 'success' ? '#e8f5e9' : '#ffebee',
            border: `2px solid ${testResult.type === 'success' ? '#4caf50' : '#f44336'}`,
            borderRadius: '8px',
            color: testResult.type === 'success' ? '#2e7d32' : '#c62828'
          }}>
            {testResult.message}
          </div>
        )}
      </div>

      <div style={{
        marginTop: '24px',
        padding: '20px',
        background: '#e3f2fd',
        borderRadius: '12px',
        border: '2px solid #2196f3'
      }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px', color: '#1976d2' }}>
          💡 Troubleshooting: Device Connected but No Logs
        </h3>
        <div style={{ fontSize: '14px', color: '#666', lineHeight: '1.8' }}>
          <p style={{ marginBottom: '12px', fontWeight: 600 }}>
            If devices show as connected but logs aren't appearing:
          </p>
          <ol style={{ paddingLeft: '20px', marginBottom: '16px' }}>
            <li style={{ marginBottom: '8px' }}>
              <strong>Check AI06 Device Settings:</strong>
              <ul style={{ paddingLeft: '20px', marginTop: '4px' }}>
                <li>Go to device menu → Communication → Cloud Settings</li>
                <li>Verify "Push Mode" is enabled</li>
                <li>Ensure "Real-time Upload" is ON</li>
                <li>Check that attendance logs are set to push automatically</li>
              </ul>
            </li>
            <li style={{ marginBottom: '8px' }}>
              <strong>Verify Device Configuration:</strong>
              <ul style={{ paddingLeft: '20px', marginTop: '4px' }}>
                <li>Server IP: {window.location.hostname}</li>
                <li>Server Port: {serverPort || '—'}</li>
                <li>Protocol: WebSocket (not HTTP)</li>
              </ul>
            </li>
            <li style={{ marginBottom: '8px' }}>
              <strong>Check Backend Logs:</strong> Look for messages like "📨 Received:" in the server console when someone scans their face
            </li>
            <li style={{ marginBottom: '8px' }}>
              <strong>Test with Manual Scan:</strong> Have someone scan their face on the device and watch the backend logs
            </li>
            <li style={{ marginBottom: '8px' }}>
              <strong>Device Registration:</strong> The device must send a "reg" command first before it can send logs
            </li>
          </ol>
          
          <div style={{
            padding: '12px',
            background: '#fff3e0',
            borderRadius: '8px',
            marginTop: '12px'
          }}>
            <strong>⚠️ Common Issue:</strong> Some AI06 devices need to be configured to push logs in real-time. 
            Check the device's "Upload Mode" setting and ensure it's set to "Real-time" not "Manual" or "Scheduled".
          </div>
        </div>
      </div>

      <div style={{
        marginTop: '24px',
        padding: '20px',
        background: '#e8f5e9',
        borderRadius: '12px',
        border: '2px solid #4caf50'
      }}>
        <h3 style={{ marginBottom: '12px', fontSize: '16px', color: '#2e7d32' }}>
          📋 Expected Device Message Format
        </h3>
        <p style={{ fontSize: '14px', color: '#666', marginBottom: '12px' }}>
          The AI06 device should send JSON messages in this format:
        </p>
        <pre style={{
          padding: '12px',
          background: '#f5f5f5',
          borderRadius: '8px',
          fontSize: '12px',
          overflow: 'auto',
          border: '1px solid #ddd'
        }}>
{`{
  "cmd": "sendlog",
  "count": 1,
  "record": [
    {
      "enrollid": "123",
      "name": "Staff Name",
      "time": "2026-02-15 14:30:00",
      "mode": 3,
      "inout": 0
    }
  ]
}`}
        </pre>
      </div>
    </div>
  );
};

export default DeviceStatus;
