const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

// Security middleware
const { authenticateWithBranch, validateBranchCode } = require('../middleware/branchAuth');
const { requirePermission, FINANCE_PERMISSIONS } = require('../middleware/financeAuth');

/**
 * GET /api/finance/classes
 * Get all available classes
 */
router.get('/classes', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.FEE_STRUCTURES_VIEW), async (req, res) => {
  try {
    // Ensure school_schema_points schema and classes table exist
    await pool.query('CREATE SCHEMA IF NOT EXISTS school_schema_points');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS school_schema_points.classes (
        id SERIAL PRIMARY KEY,
        class_count INTEGER DEFAULT 0,
        class_names TEXT[] DEFAULT '{}',
        custom_fields JSONB DEFAULT '{}'::jsonb,
        class_configs JSONB DEFAULT '{}'::jsonb
      )
    `);
    // Get classes from school_schema_points.classes
    const result = await pool.query(`
      SELECT class_names FROM school_schema_points.classes WHERE id = 1
    `);
    
    if (result.rows.length > 0 && result.rows[0].class_names) {
      const classes = result.rows[0].class_names.map(className => ({
        name: className,
        value: className
      }));
      res.json({ data: classes });
    } else {
      res.json({ data: [] });
    }
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch classes',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/classes/:className/students
 * Get all students in a specific class
 */
router.get('/classes/:className/students', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.FEE_STRUCTURES_VIEW), async (req, res) => {
  const { className } = req.params;
  
  try {
    // Validate className to prevent SQL injection
    const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
    if (!validTableName) {
      return res.status(400).json({ 
        error: 'VALIDATION_ERROR',
        message: 'Invalid class name provided.' 
      });
    }

    // Check if table exists
    const tableExists = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'classes_schema' AND table_name = $1
    `, [className]);

    if (tableExists.rows.length === 0) {
      return res.json({ data: [] });
    }

    // Get students from the class table
    const result = await pool.query(`
      SELECT 
        school_id,
        class_id,
        student_name,
        age,
        gender,
        guardian_name,
        guardian_phone,
        image_student
      FROM classes_schema."${className}"
      WHERE school_id IS NOT NULL AND class_id IS NOT NULL AND student_name IS NOT NULL
      ORDER BY LOWER(student_name) ASC
    `);

    const students = result.rows.map(student => ({
      id: `${student.school_id}-${student.class_id}`,
      schoolId: student.school_id,
      classId: student.class_id,
      name: student.student_name,
      age: student.age,
      gender: student.gender,
      guardianName: student.guardian_name,
      guardianPhone: student.guardian_phone,
      image: student.image_student,
      className: className
    }));

    res.json({ data: students });
  } catch (error) {
    console.error(`Error fetching students for class ${className}:`, error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch students',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/classes/:className/student-count
 * Get student count for a specific class
 */
router.get('/classes/:className/student-count', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.FEE_STRUCTURES_VIEW), async (req, res) => {
  const { className } = req.params;
  
  try {
    const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
    if (!validTableName) {
      return res.status(400).json({ 
        error: 'VALIDATION_ERROR',
        message: 'Invalid class name provided.' 
      });
    }

    // Check if table exists
    const tableExists = await pool.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'classes_schema' AND table_name = $1
    `, [className]);

    if (tableExists.rows.length === 0) {
      return res.json({ count: 0 });
    }

    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM classes_schema."${className}"
      WHERE school_id IS NOT NULL AND class_id IS NOT NULL AND student_name IS NOT NULL
    `);

    res.json({ count: parseInt(result.rows[0].count) });
  } catch (error) {
    console.error(`Error fetching student count for class ${className}:`, error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch student count',
      details: error.message
    });
  }
});

/**
 * GET /api/finance/all-students
 * Get all students across all classes
 */
router.get('/all-students', authenticateWithBranch, requirePermission(FINANCE_PERMISSIONS.FEE_STRUCTURES_VIEW), async (req, res) => {
  try {
    // Get all class names
    const classesResult = await pool.query(`
      SELECT class_names FROM school_schema_points.classes WHERE id = 1
    `);
    
    if (!classesResult.rows.length || !classesResult.rows[0].class_names) {
      return res.json({ data: [] });
    }

    const classNames = classesResult.rows[0].class_names;
    const allStudents = [];

    // Fetch students from each class
    for (const className of classNames) {
      const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
      if (!validTableName) continue;

      try {
        const result = await pool.query(`
          SELECT 
            school_id,
            class_id,
            student_name,
            age,
            gender,
            guardian_name,
            guardian_phone
          FROM classes_schema."${className}"
          WHERE school_id IS NOT NULL AND class_id IS NOT NULL AND student_name IS NOT NULL
          ORDER BY LOWER(student_name) ASC
        `);

        result.rows.forEach(student => {
          allStudents.push({
            id: `${student.school_id}-${student.class_id}`,
            schoolId: student.school_id,
            classId: student.class_id,
            name: student.student_name,
            age: student.age,
            gender: student.gender,
            guardianName: student.guardian_name,
            guardianPhone: student.guardian_phone,
            className: className
          });
        });
      } catch (error) {
        console.error(`Error fetching students from ${className}:`, error);
        // Continue with other classes
      }
    }

    res.json({ data: allStudents });
  } catch (error) {
    console.error('Error fetching all students:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch students',
      details: error.message
    });
  }
});

module.exports = router;
