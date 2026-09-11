import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { formatAPIError } from '../utils/errorMessages';
import { getBranchCode } from '../utils/branchCode';

const DAY_NAMES = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };

const ScheduleEditor = () => {
  const [schedule, setSchedule] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => { fetchData(); }, []);

  const h = { 'x-branch-code': getBranchCode() };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [schedRes, reportRes] = await Promise.all([
        fetch('/api/schedule/schedule', { headers: h }),
        fetch('/api/schedule/schedule-report', { headers: h })
      ]);
      if (schedRes.ok) setSchedule(await schedRes.json());
      if (reportRes.ok) setReport(await reportRes.json());
    } catch (e) { setMessage(formatAPIError(e, 'Failed to load schedule')); }
    finally { setLoading(false); }
  };

  const handleSlotClick = async (slot) => {
    if (!selectedSlot) {
      setSelectedSlot(slot);
    } else if (selectedSlot.id === slot.id) {
      setSelectedSlot(null);
    } else {
      // Swap
      try {
        const res = await fetch('/api/schedule/swap-slots', {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
          body: JSON.stringify({ slot1_id: selectedSlot.id, slot2_id: slot.id })
        });
        if (res.ok) {
          setMessage(`Swapped "${selectedSlot.subject_name || 'Free'}" with "${slot.subject_name || 'Free'}"`);
          fetchData();
        } else {
          const err = await res.json();
          setMessage('Swap failed: ' + (err.error || 'Unknown error'));
        }
      } catch (e) { setMessage(formatAPIError(e, 'Failed to swap slots')); }
      setSelectedSlot(null);
    }
  };

  const days = [...new Set(schedule.map(s => s.day_of_week))].sort();
  const periods = [...new Set(schedule.map(s => s.period_number))].sort((a, b) => a - b);
  const shifts = [...new Set(schedule.map(s => s.shift_id))].sort();

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Schedule Editor</h2>
      <button onClick={fetchData} disabled={loading} style={{ marginBottom: '1rem', padding: '8px 16px' }}>
        Refresh Schedule
      </button>
      {message && <p style={{ padding: '8px', background: '#f0fdf4', borderRadius: '6px', marginBottom: '1rem' }}>{message}</p>}

      {/* Report Section */}
      {report && Array.isArray(report.stats) && (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {report.stats.map(s => (
            <div key={s.shift_id} style={{ background: '#f8f9fa', borderRadius: '8px', padding: '1rem', flex: '1', minWidth: '200px' }}>
              <h4 style={{ margin: '0 0 0.5rem 0' }}>Shift {s.shift_id}</h4>
              <p style={{ margin: '2px 0' }}>Slots: {s.total_slots}</p>
              <p style={{ margin: '2px 0' }}>Classes: {s.classes}</p>
              <p style={{ margin: '2px 0' }}>Teachers: {s.teachers}</p>
              <p style={{ margin: '2px 0' }}>Subjects: {s.subjects}</p>
              <p style={{ margin: '2px 0' }}>Days: {s.days} × {s.periods_per_day} periods</p>
            </div>
          ))}
        </div>
      )}

      {report && Array.isArray(report.perTeacher) && report.perTeacher.length > 0 && (
        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Teacher Assignments</summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {report.perTeacher.map((t, i) => (
              <span key={i} style={{ background: '#f3e8ff', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem' }}>
                {t.teacher_name}: {t.slots} slots, {t.classes} classes, {t.subjects} subjects
              </span>
            ))}
          </div>
        </details>
      )}

      {loading && <p>Loading schedule...</p>}

      {/* Timetable grid per shift */}
      {shifts.map(shiftId => (
        <div key={shiftId} style={{ marginBottom: '2rem' }}>
          <h3>Shift {shiftId} {shiftId === 1 ? '(Morning)' : '(Afternoon)'}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Period</th>
                  {days.map(d => <th key={d} style={thStyle}>{DAY_NAMES[d]}</th>)}
                </tr>
              </thead>
              <tbody>
                {periods.map(period => (
                  <tr key={period}>
                    <td style={{ ...tdStyle, fontWeight: 600, textAlign: 'center' }}>P{period}</td>
                    {days.map(day => {
                      const slot = schedule.find(s => s.day_of_week === day && s.period_number === period && s.shift_id === shiftId && !s.subject_name?.includes('Free'));
                      const freeSlot = schedule.find(s => s.day_of_week === day && s.period_number === period && s.shift_id === shiftId);
                      const cell = slot || freeSlot;
                      const isSelected = selectedSlot && selectedSlot.id === cell?.id;
                      const isFilled = cell?.teacher_name && cell?.subject_name && !cell.subject_name.includes('Free');
                      return (
                        <td key={`${day}-${period}`}
                          onClick={() => cell && handleSlotClick(cell)}
                          style={{
                            ...tdStyle,
                            cursor: cell ? 'pointer' : 'default',
                            background: isSelected ? '#bfdbfe' : isFilled ? '#f0fdf4' : '#fef3c7',
                            border: isSelected ? '2px solid #2563eb' : '1px solid #ddd'
                          }}>
                          {cell ? (
                            <div style={{ padding: '2px 4px' }}>
                              <div style={{ fontWeight: 500, fontSize: '0.8rem' }}>{cell.subject_name || 'Free'}</div>
                              {cell.teacher_name && <div style={{ fontSize: '0.7rem', color: '#666' }}>{cell.teacher_name}</div>}
                            </div>
                          ) : <span style={{ color: '#999' }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedSlot && <p style={{ marginTop: '0.5rem', color: '#2563eb', fontSize: '0.85rem' }}>
            Selected: {selectedSlot.subject_name || 'Free'} ({selectedSlot.teacher_name || 'N/A'}) — P{selectedSlot.period_number} {DAY_NAMES[selectedSlot.day_of_week]} — click another slot to swap
          </p>}
        </div>
      ))}
    </div>
  );
};

const thStyle = { background: '#f3f4f6', padding: '8px', textAlign: 'center', border: '1px solid #ddd', position: 'sticky', top: 0 };
const tdStyle = { padding: '4px', border: '1px solid #ddd', textAlign: 'center', verticalAlign: 'top', minWidth: '120px' };

export default ScheduleEditor;
