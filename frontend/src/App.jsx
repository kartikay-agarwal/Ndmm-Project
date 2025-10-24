// src/App.jsx
import React from 'react';
import LiveRoute from './components/LiveRoute';
import './index.css';

export default function App() {
  return (
    <div style={{ padding: 16 }}>
      <h1>Shelter Map — Live Tracking</h1>
      <LiveRoute />
    </div>
  );
}
