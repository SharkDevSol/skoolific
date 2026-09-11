import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from '../Finance/PaymentManagement.module.css';

const API_URL = import.meta.env.VITE_API_URL || '';

const StaffShiftAssignment = () => {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [filterShift, setFilterShift] = useState('ALL');
  const [filterDepartment, setFilterDepartment] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchAllStaff();
  }, []);

  const fetchAllStaff = async () => {
    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const types = ['Teachers', 'Administrative Staff', 'Supportive Staff', 'Finance'];
      let allStaff = [];

      for (const staffType of types) {
        try {
          const classesResponse = await axios.get(
            `${API_URL}/staff/classes?staffType=${encodeURIComponent(staffType)}`
          );

          for (const className of classesResponse.data) {
            try {
              const dataResponse = await axios.get(
                `${API_URL}/staff/data/${staffType}/${className}`,
                { headers: { 'Authorization': `Bearer ${token}` } }
              );

              const staffWithMeta = dataResponse.data.data.map(staff => ({
                id: staff.global_staff_id || staff.staff_id || staff.id,
                name: staff.full_name || staff.name || 'Unknown',
                department: staffType,
                className,
                shift_assignment: staff.shift_assignment || 'shift1',
                email: staff.email,
                phone: staff.phone
              }));

              allStaff = [...allStaff, ...staffWithMeta];
            } catch (error) {
              console.error(`Error fetching ${staffType} - ${className}:`, error);
            }
          }
        } catch (error) {
          console.error(`Error fetching classes for ${staffType}:`, error);
        }
      }

      setStaff(allStaff);
    } catch (error) {
      console.error('Error fetching staff:', error);
      setMessage('Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  const handleShiftChange = async (staffMember, newShift) => {
    setSaving(true);
    setMessage('');

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      
      const response = await axios.put(
        `${API_URL}/hr/shift-settings/staff/${staffMember.department}/${staffMember.className}/${staffMember.id}/shift`,
        { shift_assignment: newShift },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setStaff(prevStaff =>
          prevStaff.map(s =>
            s.id === staffMember.id && s.className === staffMember.className
              ? { ...s, shift_assignment: newShift }
              : s
          )
        );
        setMessage(`✅ ${staffMember.name}'s shift updated to ${getShiftLabel(newShift)}`);
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      console.error('Error updating shift:', error);
      setMessage(`❌ Failed to update ${staffMember.name}'s shift`);
    } finally {
      setSaving(false);
    }
  };

  const getShiftLabel = (shift) => {
    switch (shift) {
      case 'shift1': return 'Shift 1 (Morning)';
      case 'shift2': return 'Shift 2 (Afternoon)';
      case 'both': return 'Both Shifts';
      default: return shift;
    }
  };

  const getShiftBadgeClass = (shift) => {
    switch (shift) {
      case 'shift1': return styles.shiftBadge1;
      case 'shift2': return styles.shiftBadge2;
      case 'both': return styles.shiftBadgeBoth;
      default: return styles.shiftBadge1;
    }
  };

  const filteredStaff = staff.filter(s => {
    const matchesShift = filterShift === 'ALL' || s.shift_assignment === filterShift;
    const matchesDepartment = filterDepartment === 'ALL' || s.department === filterDepartment;
    const matchesSearch = searchTerm === '' || 
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesShift && matchesDepartment && matchesSearch;
  });

  const shiftCounts = {
    shift1: staff.filter(s => s.shift_assignment === 'shift1').length,
    shift2: staff.filter(s => s.shift_assignment === 'shift2').length,
    both: staff.filter(s => s.shift_assignment === 'both').length
  };

  if (loading) {
    return <div className={styles.loading}>Loading staff...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>👥 Staff Shift Assignment</h1>
        <p>Assign staff to Shift 1, Shift 2, or Both</p>
      </div>

      {message && (
        <div className={message.includes('✅') ? styles.successMessage : styles.errorMessage}>
          {message}
        </div>
      )}

      {/* Summary Cards */}
      <div className={styles.summaryCards}>
        <div className={styles.summaryCard}>
          <h3>🌅 Shift 1</h3>
          <div className={styles.summaryValue}>{shiftCounts.shift1}</div>
          <p>Morning Staff</p>
        </div>
        <div className={styles.summaryCard}>
          <h3>🌆 Shift 2</h3>
          <div className={styles.summaryValue}>{shiftCounts.shift2}</div>
          <p>Afternoon Staff</p>
        </div>
        <div className={styles.summaryCard}>
          <h3>🔄 Both Shifts</h3>
          <div className={styles.summaryValue}>{shiftCounts.both}</div>
          <p>Dual Shift Staff</p>
        </div>
        <div className={styles.summaryCard}>
          <h3>👥 Total</h3>
          <div className={styles.summaryValue}>{staff.length}</div>
          <p>All Staff</p>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <input
          type="text"
          placeholder="🔍 Search by name or email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />

        <select
          value={filterShift}
          onChange={(e) => setFilterShift(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="ALL">All Shifts</option>
          <option value="shift1">Shift 1 Only</option>
          <option value="shift2">Shift 2 Only</option>
          <option value="both">Both Shifts</option>
        </select>

        <select
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
          className={styles.filterSelect}
        >
          <option value="ALL">All Departments</option>
          <option value="Teachers">Teachers</option>
          <option value="Administrative Staff">Administrative Staff</option>
          <option value="Supportive Staff">Supportive Staff</option>
        </select>
      </div>

      {/* Staff Table */}
      <div className={styles.tableContainer}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Staff ID</th>
              <th>Name</th>
              <th>Department</th>
              <th>Class</th>
              <th>Current Shift</th>
              <th>Assign Shift</th>
            </tr>
          </thead>
          <tbody>
            {filteredStaff.length === 0 ? (
              <tr>
                <td colSpan="6" className={styles.noData}>
                  No staff found matching filters
                </td>
              </tr>
            ) : (
              filteredStaff.map((staffMember, index) => (
                <tr key={`${staffMember.id}-${staffMember.className}-${index}`}>
                  <td>{staffMember.id}</td>
                  <td>
                    <strong>{staffMember.name}</strong>
                    {staffMember.email && <div className={styles.subText}>{staffMember.email}</div>}
                  </td>
                  <td>{staffMember.department}</td>
                  <td>{staffMember.className}</td>
                  <td>
                    <span className={getShiftBadgeClass(staffMember.shift_assignment)}>
                      {getShiftLabel(staffMember.shift_assignment)}
                    </span>
                  </td>
                  <td>
                    <select
                      value={staffMember.shift_assignment}
                      onChange={(e) => handleShiftChange(staffMember, e.target.value)}
                      disabled={saving}
                      className={styles.shiftSelect}
                    >
                      <option value="shift1">🌅 Shift 1</option>
                      <option value="shift2">🌆 Shift 2</option>
                      <option value="both">🔄 Both</option>
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StaffShiftAssignment;
