const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

// Initialize task completions table
async function initTaskCompletionsTable() {
  try {
    console.log('🔧 Initializing task_completions table...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS task_completions (
        id SERIAL PRIMARY KEY,
        task_id INTEGER UNIQUE NOT NULL,
        completed BOOLEAN DEFAULT false,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert default rows for all 6 tasks (V2 setup)
    for (let i = 1; i <= 6; i++) {
      await pool.query(`
        INSERT INTO task_completions (task_id, completed)
        VALUES ($1, false)
        ON CONFLICT (task_id) DO NOTHING
      `, [i]);
    }
    console.log('✅ task_completions table initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing task_completions table:', error);
  }
}

// Initialize on module load
initTaskCompletionsTable();

// Mark a task as manually completed
router.post('/complete/:taskId', async (req, res) => {
  try {
    const taskId = parseInt(req.params.taskId);
    console.log(`📝 Received request to complete task ${taskId}`);
    
    if (taskId < 1 || taskId > 6) {
      console.log(`❌ Invalid task ID: ${taskId}`);
      return res.status(400).json({
        success: false,
        error: 'Invalid task ID'
      });
    }

    const result = await pool.query(`
      UPDATE task_completions 
      SET completed = true, completed_at = CURRENT_TIMESTAMP
      WHERE task_id = $1
      RETURNING *
    `, [taskId]);

    console.log(`✅ Task ${taskId} marked as completed:`, result.rows[0]);

    res.json({
      success: true,
      message: `Task ${taskId} marked as completed`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error marking task as complete:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark task as complete',
      details: error.message
    });
  }
});

// Check task completion status based on database data
router.get('/status', async (req, res) => {
  try {
    const taskStatus = {
      1: false, // School Year Setup
      2: false, // Create Student Registration Form
      3: false, // Create Staff Registration Form
      4: false, // Configure Subjects & Classes
      5: false, // Teacher-Class-Subject Mapping
      6: false  // Schedule Configuration
    };

    // Get all manual completions first
    const manualCompletions = await pool.query('SELECT task_id, completed FROM task_completions WHERE task_id <= 6');
    manualCompletions.rows.forEach(row => {
      if (row.completed) taskStatus[row.task_id] = true;
    });

    // Task 1: School Year Setup - Check if school config exists
    if (!taskStatus[1]) {
      try {
        const schoolConfig = await pool.query('SELECT COUNT(*) FROM schedule_schema.school_config WHERE id = 1');
        taskStatus[1] = parseInt(schoolConfig.rows[0].count) > 0;
      } catch (e) {
        console.log('Task 1 smart check failed:', e.message);
      }
    }

    // Task 2: Create Student Registration Form - Check if classes exist
    if (!taskStatus[2]) {
      try {
        const classes = await pool.query('SELECT COUNT(*) FROM school_schema_points.classes');
        taskStatus[2] = parseInt(classes.rows[0].count) > 0;
      } catch (e) {
        console.log('Task 2 smart check failed:', e.message);
      }
    }

    // Task 3: Create Staff Registration Form - Check if staff tables exist
    if (!taskStatus[3]) {
      try {
        const staffCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema IN ('staff_teaching_staff', 'staff_teachers', 'staff_administrative_staff', 'staff_supportive_staff', 'staff_finance')
          );
        `);
        taskStatus[3] = staffCheck.rows[0].exists;
      } catch (e) {
        console.log('Task 3 smart check failed:', e.message);
      }
    }

    // Task 4: Configure Subjects & Classes - Check if subjects exist
    if (!taskStatus[4]) {
      try {
        const subjects = await pool.query('SELECT COUNT(*) FROM subjects_of_school_schema.subjects');
        taskStatus[4] = parseInt(subjects.rows[0].count) > 0;
      } catch (e) {
        console.log('Task 4 smart check failed:', e.message);
      }
    }

    // Task 5: Teacher-Class-Subject Mapping - Check if teachers are assigned
    if (!taskStatus[5]) {
      try {
        const teacherAssignments = await pool.query('SELECT COUNT(*) FROM subjects_of_school_schema.teachers_subjects');
        taskStatus[5] = parseInt(teacherAssignments.rows[0].count) > 0;
      } catch (e) {
        console.log('Task 5 smart check failed:', e.message);
      }
    }

    // Task 6: Schedule Configuration - Check if schedule exists
    if (!taskStatus[6]) {
      try {
        const schedules = await pool.query('SELECT COUNT(*) FROM schedule_schema.schedule_slots');
        taskStatus[6] = parseInt(schedules.rows[0].count) > 0;
      } catch (e) {
        console.log('Task 6 smart check failed:', e.message);
      }
    }

    // Calculate completed tasks
    const completedTasks = Object.keys(taskStatus).filter(key => taskStatus[key]);
    const totalTasks = Object.keys(taskStatus).length;
    const progress = Math.round((completedTasks.length / totalTasks) * 100);

    res.json({
      success: true,
      taskStatus,
      completedTasks: completedTasks.map(Number),
      totalTasks,
      progress
    });

  } catch (error) {
    console.error('Error checking task status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check task status',
      message: error.message
    });
  }
});

module.exports = router;
