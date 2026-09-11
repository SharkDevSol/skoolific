const express = require('express');
const pool = require('../config/db');
const { authenticateWithBranch } = require('../middleware/branchAuth');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');
const router = express.Router();

// All mark list routes require branch authentication
router.use(authenticateWithBranch);

// Helper function to check if is_active column exists and build WHERE clause
const getActiveStudentsWhereClause = async (client, className) => {
  const columnCheck = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_schema = 'classes_schema' 
      AND table_name = $1 
      AND column_name = 'is_active'
  `, [className]);
  
  const hasIsActive = columnCheck.rows.length > 0;
  return hasIsActive ? 'WHERE is_active = TRUE OR is_active IS NULL' : '';
};

// Initialize subjects_of_school_schema and required tables
const initializeSubjectsSchema = async () => {
  try {
    await pool.query(`CREATE SCHEMA IF NOT EXISTS subjects_of_school_schema`);
    
    // Create subjects table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subjects_of_school_schema.subjects (
        id SERIAL PRIMARY KEY,
        subject_name VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create subject_class_mappings table for selective subject-class mappings
    // Note: Removed foreign key constraint to avoid issues with subject deletion
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subjects_of_school_schema.subject_class_mappings (
        id SERIAL PRIMARY KEY,
        subject_name VARCHAR(100) NOT NULL,
        class_name VARCHAR(50) NOT NULL,
        subject_class VARCHAR(150) GENERATED ALWAYS AS (subject_name || ' Class ' || class_name) STORED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subject_name, class_name)
      )
    `);
    
    // Create teachers_subjects table for mapping teachers to subject-class combinations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subjects_of_school_schema.teachers_subjects (
        id SERIAL PRIMARY KEY,
        teacher_name VARCHAR(100) NOT NULL,
        subject_class VARCHAR(150) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(teacher_name, subject_class)
      )
    `);
    
    // Create school_config table for storing term count
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subjects_of_school_schema.school_config (
        id SERIAL PRIMARY KEY,
        term_count INTEGER NOT NULL DEFAULT 2,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert default term count if not exists
    const configResult = await pool.query('SELECT * FROM subjects_of_school_schema.school_config WHERE id = 1');
    if (configResult.rows.length === 0) {
      await pool.query('INSERT INTO subjects_of_school_schema.school_config (id, term_count) VALUES (1, 2)');
    }

    // Auto-sync subjects from mappings if subjects table is empty
    const subjectsCount = await pool.query('SELECT COUNT(*) FROM subjects_of_school_schema.subjects');
    if (parseInt(subjectsCount.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO subjects_of_school_schema.subjects (subject_name)
        SELECT DISTINCT subject_name FROM subjects_of_school_schema.subject_class_mappings
        ON CONFLICT (subject_name) DO NOTHING
      `);
      console.log('Auto-synced subjects from mappings');
    }

    console.log('Subjects schema initialized successfully');
  } catch (error) {
    console.error('Error initializing subjects schema:', error);
  }
};

initializeSubjectsSchema().catch(err => console.error('Subjects schema init:', err));

// Helper function to get class-subject mappings
const getClassSubjectMappings = async () => {
  try {
    const result = await pool.query(`
      SELECT subject_name, class_name, subject_class
      FROM subjects_of_school_schema.subject_class_mappings
      ORDER BY subject_name, class_name
    `);
    return result.rows;
  } catch (error) {
    console.error('Error fetching class-subject mappings:', error);
    return [];
  }
};

// Route to configure subjects and terms
router.post('/configure-subjects', async (req, res) => {
  const { subjectCount, subjectNames, termCount } = req.body;
  
  if (!subjectCount || !subjectNames || !termCount) {
    return res.status(400).json({ error: 'Subject count, subject names, and term count are required' });
  }
  
  if (subjectNames.length !== parseInt(subjectCount)) {
    return res.status(400).json({ error: 'Number of subject names must match subject count' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Clear existing subjects
    await client.query('DELETE FROM subjects_of_school_schema.subjects');
    
    // Insert new subjects with ON CONFLICT to handle duplicates
    for (const subjectName of subjectNames) {
      if (subjectName.trim()) {
        await client.query(
          'INSERT INTO subjects_of_school_schema.subjects (subject_name) VALUES ($1) ON CONFLICT (subject_name) DO NOTHING',
          [subjectName.trim()]
        );
      }
    }
    
    // Update term count
    await client.query(
      'UPDATE subjects_of_school_schema.school_config SET term_count = $1, updated_at = CURRENT_TIMESTAMP WHERE id = 1',
      [parseInt(termCount)]
    );
    
    await client.query('COMMIT');
    res.json({ message: 'Subjects and terms configured successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error configuring subjects:', error);
    res.status(500).json({ error: 'Failed to configure subjects', details: error.message });
  } finally {
    client.release();
  }
});

// Route to get all subjects
router.get('/subjects', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subjects_of_school_schema.subjects ORDER BY subject_name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching subjects:', error);
    res.status(500).json({ error: 'Failed to fetch subjects', details: error.message });
  }
});

// Route to sync subjects from subject_class_mappings into subjects table
router.post('/sync-subjects-from-mappings', async (req, res) => {
  try {
    const result = await pool.query(`
      INSERT INTO subjects_of_school_schema.subjects (subject_name)
      SELECT DISTINCT subject_name FROM subjects_of_school_schema.subject_class_mappings
      ON CONFLICT (subject_name) DO NOTHING
      RETURNING subject_name
    `);
    res.json({ message: `Synced ${result.rows.length} subjects`, subjects: result.rows });
  } catch (error) {
    console.error('Error syncing subjects:', error);
    res.status(500).json({ error: 'Failed to sync subjects', details: error.message });
  }
});

// Route to add a single subject (does NOT delete existing)
router.post('/add-subject', async (req, res) => {
  const { subject_name } = req.body;
  if (!subject_name || !subject_name.trim()) {
    return res.status(400).json({ error: 'Subject name is required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO subjects_of_school_schema.subjects (subject_name) VALUES ($1) ON CONFLICT (subject_name) DO NOTHING RETURNING *',
      [subject_name.trim()]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'Subject already exists' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error adding subject:', error);
    res.status(500).json({ error: 'Failed to add subject', details: error.message });
  }
});

// Route to update a subject name (edit only)
router.put('/update-subject/:id', async (req, res) => {
  const { id } = req.params;
  const { subject_name } = req.body;
  if (!subject_name || !subject_name.trim()) {
    return res.status(400).json({ error: 'Subject name is required' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const old = await client.query('SELECT subject_name FROM subjects_of_school_schema.subjects WHERE id = $1', [id]);
    if (old.rows.length === 0) return res.status(404).json({ error: 'Subject not found' });
    const oldName = old.rows[0].subject_name;
    const newName = subject_name.trim();
    // Update subject name
    await client.query('UPDATE subjects_of_school_schema.subjects SET subject_name = $1 WHERE id = $2', [newName, id]);
    // Update mappings
    await client.query('UPDATE subjects_of_school_schema.subject_class_mappings SET subject_name = $1 WHERE subject_name = $2', [newName, oldName]);
    await client.query('UPDATE subjects_of_school_schema.teachers_subjects SET subject_class = REPLACE(subject_class, $1, $2) WHERE subject_class LIKE $3', [oldName, newName, `${oldName}%`]);
    await client.query('COMMIT');
    res.json({ message: 'Subject updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating subject:', error);
    res.status(500).json({ error: 'Failed to update subject', details: error.message });
  } finally {
    client.release();
  }
});

// Route to delete a subject (explicit delete only)
router.delete('/delete-subject/:id', async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const subj = await client.query('SELECT subject_name FROM subjects_of_school_schema.subjects WHERE id = $1', [id]);
    if (subj.rows.length === 0) return res.status(404).json({ error: 'Subject not found' });
    const subjectName = subj.rows[0].subject_name;
    await client.query('DELETE FROM subjects_of_school_schema.subject_class_mappings WHERE subject_name = $1', [subjectName]);
    await client.query('DELETE FROM subjects_of_school_schema.subjects WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ message: 'Subject deleted successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error deleting subject:', error);
    res.status(500).json({ error: 'Failed to delete subject', details: error.message });
  } finally {
    client.release();
  }
});

// Route to get school configuration (term count)
router.get('/config', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM subjects_of_school_schema.school_config WHERE id = 1');
    res.json(result.rows[0] || { term_count: 2 });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: 'Failed to fetch config', details: error.message });
  }
});

// Route to get all classes
router.get('/classes', async (req, res) => {
  try {
    // Get classes from actual tables (classes_schema)
    const tableResult = await pool.query(`
      SELECT table_name AS class_name FROM information_schema.tables 
      WHERE table_schema = 'classes_schema'
    `);
    const tableClasses = tableResult.rows.map(row => row.class_name);

    // Also get classes from metadata (school_schema_points.classes)
    try {
      const metaResult = await pool.query(`SELECT class_names FROM school_schema_points.classes WHERE id = 1`);
      if (metaResult.rows.length > 0 && metaResult.rows[0].class_names) {
        const metaClasses = metaResult.rows[0].class_names;
        // Merge: add classes from metadata that aren't already in tableClasses
        for (const cls of metaClasses) {
          if (!tableClasses.includes(cls)) {
            tableClasses.push(cls);
          }
        }
      }
    } catch (e) {
      // school_schema_points.classes may not exist yet — ignore
    }

    res.json(tableClasses);
  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes', details: error.message });
  }
});

// Route to map subjects to classes
router.post('/map-subjects-classes', async (req, res) => {
  const { mappings } = req.body; // Array of { className, subjectName }
  
  if (!mappings || !Array.isArray(mappings)) {
    return res.status(400).json({ error: 'Mappings array is required' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Ensure table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS subjects_of_school_schema.subject_class_mappings (
        id SERIAL PRIMARY KEY,
        subject_name VARCHAR(100) NOT NULL,
        class_name VARCHAR(50) NOT NULL,
        subject_class VARCHAR(150) GENERATED ALWAYS AS (subject_name || ' Class ' || class_name) STORED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(subject_name, class_name)
      )
    `);
    
    // Delete only the mappings that are NOT in the new list (user unchecked them)
    // First get all existing mappings
    const existingResult = await client.query(
      'SELECT subject_name, class_name FROM subjects_of_school_schema.subject_class_mappings'
    );
    const newSet = new Set(mappings.map(m => `${m.subjectName}||${m.className}`));
    for (const row of existingResult.rows) {
      const key = `${row.subject_name}||${row.class_name}`;
      if (!newSet.has(key)) {
        await client.query(
          'DELETE FROM subjects_of_school_schema.subject_class_mappings WHERE subject_name=$1 AND class_name=$2',
          [row.subject_name, row.class_name]
        );
      }
    }
    
    // Validate and insert new mappings
    for (const mapping of mappings) {
      if (!mapping.className || !mapping.subjectName) {
        continue;
      }
      
      // Validate class exists in classes_schema (case-insensitive check)
      const classResult = await client.query(
        `SELECT table_name FROM information_schema.tables 
         WHERE table_schema = 'classes_schema' AND LOWER(table_name) = LOWER($1)`,
        [mapping.className]
      );
      if (classResult.rows.length === 0) {
        console.warn(`Class ${mapping.className} not found in classes_schema, skipping`);
        continue; // Skip instead of throwing error
      }
      
      // Get the actual table name (with correct case)
      const actualClassName = classResult.rows[0].table_name;
      
      // Validate subject exists
      const subjectResult = await client.query(
        'SELECT subject_name FROM subjects_of_school_schema.subjects WHERE subject_name = $1',
        [mapping.subjectName]
      );
      if (subjectResult.rows.length === 0) {
        console.warn(`Subject ${mapping.subjectName} not found, skipping`);
        continue; // Skip instead of throwing error
      }
      
      // Insert mapping using the actual class name from database
      await client.query(
        'INSERT INTO subjects_of_school_schema.subject_class_mappings (class_name, subject_name) VALUES ($1, $2) ON CONFLICT (subject_name, class_name) DO NOTHING',
        [actualClassName, mapping.subjectName]
      );
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Subject-class mappings saved successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error mapping subjects to classes:', error);
    res.status(500).json({ error: 'Failed to map subjects to classes', details: error.message });
  } finally {
    client.release();
  }
});

// Route to get subject-class mappings
router.get('/subjects-classes', async (req, res) => {
  try {
    const mappings = await getClassSubjectMappings();
    res.json(mappings);
  } catch (error) {
    console.error('Error fetching subject-class mappings:', error);
    res.status(500).json({ error: 'Failed to fetch mappings', details: error.message });
  }
});

// Route to create mark list forms for subjects
router.post('/create-mark-forms', async (req, res) => {
  const { subjectName, termNumber, markComponents } = req.body;
  const className = req.body.className?.toLowerCase();
  
  if (!subjectName || !className || !termNumber || !markComponents) {
    return res.status(400).json({ error: 'Subject name, class name, term number, and mark components are required' });
  }
  
  // Validate that mark components total 100%
  const totalPercentage = markComponents.reduce((sum, component) => sum + component.percentage, 0);
  if (totalPercentage !== 100) {
    return res.status(400).json({ error: 'Mark components must total 100%' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Validate class exists in classes_schema (case-insensitive)
    const classResult = await client.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'classes_schema' AND LOWER(table_name) = LOWER($1)`,
      [className]
    );
    if (classResult.rows.length === 0) {
      throw new Error(`Class ${className} not found in classes_schema`);
    }
    const actualClassName = classResult.rows[0].table_name;
    
    // Validate subject exists
    const subjectResult = await client.query(
      'SELECT subject_name FROM subjects_of_school_schema.subjects WHERE subject_name = $1',
      [subjectName]
    );
    if (subjectResult.rows.length === 0) {
      throw new Error(`Subject ${subjectName} not found`);
    }
    
    // Create schema for the subject if it doesn't exist
    // Replace spaces, hyphens, and other special characters with underscores
    const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    
    // Create table name for the specific class and term
    const tableName = `${className.toLowerCase()}_term_${termNumber}`;
    
    // Check if mark list already exists for this subject+class+term
    const existsCheck = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)`,
      [schemaName, tableName]
    );
    if (existsCheck.rows[0].exists) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `Mark list already exists for ${subjectName} / ${className} / Term ${termNumber}. Delete it first if you want to recreate it.` });
    }
    
    // Build column definitions
    const baseColumns = [
      'id SERIAL PRIMARY KEY',
      'student_name VARCHAR(100) NOT NULL',
      'age INTEGER',
      'gender VARCHAR(20)'
    ];
    
    const markColumns = markComponents.map(component => 
      `${component.name.toLowerCase().replace(/[\s\-\.]+/g, '_')} DECIMAL(5,2) DEFAULT 0`
    );
    
    const additionalColumns = [
      'total DECIMAL(5,2) DEFAULT 0',
      'pass_status VARCHAR(10) DEFAULT \'Fail\'',
      'is_locked BOOLEAN DEFAULT FALSE',
      'locked_at TIMESTAMP',
      'locked_by VARCHAR(100)',
      'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'
    ];
    
    const allColumns = [...baseColumns, ...markColumns, ...additionalColumns];
    
    // Drop table if exists and create new one
    await client.query(`DROP TABLE IF EXISTS ${schemaName}.${tableName}`);
    await client.query(`CREATE TABLE ${schemaName}.${tableName} (${allColumns.join(', ')})`);
    
    // Check if is_active column exists in the class table
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'classes_schema' 
        AND table_name = $1 
        AND column_name = 'is_active'
    `, [actualClassName]);
    
    const hasIsActive = columnCheck.rows.length > 0;
    const whereClause = hasIsActive ? 'WHERE is_active = TRUE OR is_active IS NULL' : '';
    
    // Get students from the class table in classes_schema (only active students)
    const studentsResult = await client.query(`
      SELECT student_name, age, gender 
      FROM classes_schema."${actualClassName}" 
      ${whereClause}
    `);
    
    for (const student of studentsResult.rows) {
      const insertColumns = ['student_name', 'age', 'gender'];
      const insertValues = [student.student_name, student.age, student.gender];
      const placeholders = insertValues.map((_, i) => `$${i + 1}`).join(', ');
      
      await client.query(
        `INSERT INTO ${schemaName}.${tableName} (${insertColumns.join(', ')}) VALUES (${placeholders})`,
        insertValues
      );
    }
    
    // Store mark form configuration with unique constraint
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.form_config (
        id SERIAL PRIMARY KEY,
        class_name VARCHAR(50) NOT NULL,
        term_number INTEGER NOT NULL,
        mark_components JSONB NOT NULL,
        pass_threshold DECIMAL(5,2) DEFAULT 50.00,
        is_locked BOOLEAN DEFAULT FALSE,
        locked_at TIMESTAMP,
        locked_by VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_class_term UNIQUE (class_name, term_number)
      )
    `);
    
    await client.query(`
      INSERT INTO ${schemaName}.form_config (class_name, term_number, mark_components, pass_threshold)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT ON CONSTRAINT unique_class_term DO UPDATE SET
        mark_components = EXCLUDED.mark_components,
        pass_threshold = EXCLUDED.pass_threshold,
        created_at = CURRENT_TIMESTAMP
    `, [className, termNumber, JSON.stringify(markComponents), 50.00]);
    
    await client.query('COMMIT');
    res.json({ 
      message: 'Mark list form created successfully',
      schemaName,
      tableName,
      studentsCount: studentsResult.rows.length
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating mark form:', error);
    res.status(500).json({ error: 'Failed to create mark form', details: error.message });
  } finally {
    client.release();
  }
});

// Route to get mark list for a specific subject, class, and term
// Helper: normalize class name for table lookup (G8A → 8a, 8A → 8a)
const normalizeClassName = (name) => name.toLowerCase();

router.get('/mark-list/:subjectName/:className/:termNumber', async (req, res) => {
  const { subjectName, termNumber } = req.params;
  const className = req.params.className; // keep original for classes_schema lookup
  const tableClassName = normalizeClassName(className); // for subject schema table names
  
  const client = await pool.connect();
  try {
    const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
    const tableName = `${tableClassName}_term_${termNumber}`;
    
    // SYNC STUDENTS: Add new active students and remove deactivated ones
    // Try to find the actual class table name (handles G8A, 8A, 8a formats)
    const classTableCheck = await client.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'classes_schema' AND LOWER(table_name) = LOWER($1)`,
      [tableClassName]
    );
    const actualClassName = classTableCheck.rows.length > 0 ? classTableCheck.rows[0].table_name : tableClassName;

    // Check if is_active column exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'classes_schema' 
        AND table_name = $1 
        AND column_name = 'is_active'
    `, [actualClassName]);
    
    const hasIsActive = columnCheck.rows.length > 0;
    const whereClause = hasIsActive ? 'WHERE is_active = TRUE OR is_active IS NULL' : '';

    // Get current active students from class table
    const activeStudentsResult = await client.query(
      `SELECT student_name, age, gender FROM classes_schema."${actualClassName}" 
       ${whereClause}`
    );
    const activeStudents = activeStudentsResult.rows;
    
    // Get current students in mark list
    const tableExistsCheck = await client.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2)`,
      [schemaName, tableName]
    );
    if (!tableExistsCheck.rows[0].exists) {
      return res.status(404).json({ error: 'Mark list not found. Please create the mark form first.' });
    }

    const markListResult = await client.query(
      `SELECT student_name FROM ${schemaName}.${tableName}`
    );
    const markListStudents = markListResult.rows.map(r => r.student_name);
    
    // Find students to add (in class but not in mark list)
    const studentsToAdd = activeStudents.filter(
      student => !markListStudents.includes(student.student_name)
    );
    
    // Find students to remove (in mark list but not active in class)
    const activeStudentNames = activeStudents.map(s => s.student_name);
    const studentsToRemove = markListStudents.filter(
      name => !activeStudentNames.includes(name)
    );
    
    // Add new students
    for (const student of studentsToAdd) {
      await client.query(
        `INSERT INTO ${schemaName}.${tableName} (student_name, age, gender) 
         VALUES ($1, $2, $3)`,
        [student.student_name, student.age, student.gender]
      );
    }
    
    // Remove deactivated students
    for (const studentName of studentsToRemove) {
      await client.query(
        `DELETE FROM ${schemaName}.${tableName} WHERE student_name = $1`,
        [studentName]
      );
    }
    
    // Get updated mark list data (only active students)
    const result = await client.query(
      `SELECT * FROM ${schemaName}.${tableName} ORDER BY student_name`
    );
    
    // Get form configuration
    const configResult = await client.query(
      `SELECT * FROM ${schemaName}.form_config WHERE LOWER(class_name) = LOWER($1) AND term_number = $2`,
      [tableClassName, termNumber]
    );
    
    res.json({
      markList: result.rows,
      config: configResult.rows[0] || null,
      syncInfo: {
        studentsAdded: studentsToAdd.length,
        studentsRemoved: studentsToRemove.length
      }
    });
  } catch (error) {
    console.error('Error fetching mark list:', error);
    res.status(500).json({ error: 'Failed to fetch mark list', details: error.message });
  } finally {
    client.release();
  }
});

// Route to update marks for a student
router.put('/update-marks', async (req, res) => {
  const { subjectName, termNumber, studentId, marks } = req.body;
  const className = req.body.className?.toLowerCase();
  
  if (!subjectName || !className || !termNumber || !studentId || !marks) {
    return res.status(400).json({ error: 'All fields are required' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
    const tableName = `${className.toLowerCase()}_term_${termNumber}`;
    
    // Get form configuration to validate marks
    const configResult = await client.query(
      `SELECT * FROM ${schemaName}.form_config WHERE class_name = $1 AND term_number = $2`,
      [className, termNumber]
    );
    
    if (configResult.rows.length === 0) {
      throw new Error('Form configuration not found');
    }
    
    const config = configResult.rows[0];
    
    // V2 Enhancement: Check if marks are locked
    if (config.is_locked === true) {
      return res.status(403).json({ 
        error: 'Mark list is locked',
        message: `This mark list was locked by ${config.locked_by} on ${config.locked_at}. Contact an administrator to unlock it.`,
        lockedBy: config.locked_by,
        lockedAt: config.locked_at
      });
    }
    
    const markComponents = config.mark_components;
    
    // Build update query
    const updateColumns = [];
    const updateValues = [];
    let total = 0;
    
    for (const component of markComponents) {
      const componentKey = component.name.toLowerCase().replace(/[\s\-\.]+/g, '_');
      if (marks[componentKey] !== undefined) {
        const mark = parseFloat(marks[componentKey]);
        const maxMark = component.percentage;
        
        // Ensure mark doesn't exceed component percentage
        const finalMark = Math.min(mark, maxMark);
        updateColumns.push(`${componentKey} = $${updateValues.length + 1}`);
        updateValues.push(finalMark);
        total += finalMark;
      }
    }
    
    // Ensure total doesn't exceed 100
    total = Math.min(total, 100);
    
    // Determine pass status
    const passStatus = total >= config.pass_threshold ? 'Pass' : 'Fail';
    
    updateColumns.push(`total = $${updateValues.length + 1}`);
    updateValues.push(total);
    updateColumns.push(`pass_status = $${updateValues.length + 1}`);
    updateValues.push(passStatus);
    updateColumns.push(`updated_at = CURRENT_TIMESTAMP`);
    
    updateValues.push(studentId);
    
    const updateQuery = `
      UPDATE ${schemaName}.${tableName} 
      SET ${updateColumns.join(', ')} 
      WHERE id = $${updateValues.length}
    `;
    
    await client.query(updateQuery, updateValues);
    
    await client.query('COMMIT');
    res.json({ message: 'Marks updated successfully', total, passStatus });

    // ---- Push notification to the student's guardian (non-blocking) ----
    try {
      // Resolve student_name from the mark-list row (studentId)
      const studentRow = await pool.query(
        `SELECT student_name FROM ${schemaName}.${tableName} WHERE id = $1 LIMIT 1`,
        [studentId]
      );
      const studentName = studentRow.rows[0]?.student_name;
      if (studentName) {
        // Look up the guardian username from the class table for this student
        const g = await pool.query(
          `SELECT guardian_username, guardian_name FROM classes_schema."${className}" WHERE student_name = $1 LIMIT 1`,
          [studentName]
        );
        const guardianUsername = g.rows[0]?.guardian_username;
        const guardianName = g.rows[0]?.guardian_name || 'Parent';
        if (guardianUsername) {
          const { notifyGuardianPush } = require('../services/guardianPush');
          notifyGuardianPush(guardianUsername, '📊 New Marks Added', `${studentName} got ${total}% in ${subjectName} (Term ${termNumber}).`, {
            type: 'marks', student_name: studentName, subject: subjectName, total: String(total)
          }).catch(() => {});
        }
      }
    } catch (pushErr) {
      console.warn('Marks push notification failed (non-blocking):', pushErr.message);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating marks:', error);
    res.status(500).json({ error: 'Failed to update marks', details: error.message });
  } finally {
    client.release();
  }
});

// Route to get teachers from staff
router.get('/teachers', async (req, res) => {
  try {
    // Get all staff schemas
    const schemasResult = await pool.query(`
      SELECT schema_name FROM information_schema.schemata 
      WHERE schema_name LIKE 'staff_%'
    `);
    
    const teachers = [];
    
    for (const schema of schemasResult.rows) {
      const schemaName = schema.schema_name;
      
      // Get tables in this schema
      const tablesResult = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name != 'staff_counter'
      `, [schemaName]);
      
      for (const table of tablesResult.rows) {
        const tableName = table.table_name;
        
        // Get teachers from this table
        const teachersResult = await pool.query(`
          SELECT name, role FROM "${schemaName}"."${tableName}" 
          WHERE role = 'Teacher'
        `);
        
        teachers.push(...teachersResult.rows.map(row => ({
          name: row.name,
          role: row.role,
          schema: schemaName,
          table: tableName
        })));
      }
    }
    
    res.json(teachers);
  } catch (error) {
    console.error('Error fetching teachers:', error);
    res.status(500).json({ error: 'Failed to fetch teachers', details: error.message });
  }
});

// Route to calculate class ranking
router.get('/ranking/:className/:termNumber', async (req, res) => {
  const { termNumber } = req.params;
  const className = req.params.className.toLowerCase();
  
  try {
    // Validate class exists (case-insensitive)
    const classResult = await pool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'classes_schema' AND LOWER(table_name) = LOWER($1)`,
      [className]
    );
    if (classResult.rows.length === 0) {
      return res.status(404).json({ error: `Class ${className} not found` });
    }
    const actualClassName = classResult.rows[0].table_name;
    
    // Get subjects for this class
    const subjectsResult = await pool.query(
      'SELECT subject_name FROM subjects_of_school_schema.subject_class_mappings WHERE LOWER(class_name) = LOWER($1)',
      [className]
    );
    
    const subjects = subjectsResult.rows;
    
    // Fetch marks from each subject
    const studentData = {};
    
    for (const subject of subjects) {
      const subjectName = subject.subject_name;
      const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
      const tableName = `${className.toLowerCase()}_term_${termNumber}`;
      
      try {
        const marksResult = await pool.query(`SELECT student_name, total FROM ${schemaName}.${tableName}`);
        
        for (const mark of marksResult.rows) {
          if (!studentData[mark.student_name]) {
            studentData[mark.student_name] = { totalMarks: 0, subjectCount: 0 };
          }
          studentData[mark.student_name].totalMarks += mark.total || 0;
          studentData[mark.student_name].subjectCount++;
        }
      } catch (error) {
        console.log(`No marks for ${subjectName} yet`);
      }
    }
    
    // Filter out deactivated students by checking classes_schema
    const activeStudentNames = new Set();
    try {
      const activeStudentsResult = await pool.query(`
        SELECT student_name 
        FROM classes_schema."${actualClassName}" 
        WHERE is_active = TRUE OR is_active IS NULL
      `);
      activeStudentsResult.rows.forEach(row => activeStudentNames.add(row.student_name));
    } catch (error) {
      console.log('Could not check student active status, showing all students');
      // If column doesn't exist, show all students
      Object.keys(studentData).forEach(name => activeStudentNames.add(name));
    }
    
    // Calculate averages only for active students
    const rankings = Object.entries(studentData)
      .filter(([studentName]) => activeStudentNames.has(studentName))
      .map(([studentName, data]) => ({
        studentName,
        average: data.subjectCount > 0 ? data.totalMarks / data.subjectCount : 0
      }));
    
    // Sort by average (descending) and assign ranks
    rankings.sort((a, b) => b.average - a.average);
    rankings.forEach((student, index) => {
      student.rank = index + 1;
    });
    
    res.json({
      className,
      termNumber,
      rankings,
      subjects: subjects.map(s => s.subject_name)
    });
  } catch (error) {
    console.error('Error calculating class ranking:', error);
    res.status(500).json({ error: 'Failed to calculate class ranking', details: error.message });
  }
});

// Route to get available subject-class combinations for teacher assignment
router.get('/subject-class-combinations', async (req, res) => {
  try {
    const mappings = await getClassSubjectMappings();
    res.json(mappings.map(mapping => ({
      subject_name: mapping.subject_name,
      class_name: mapping.class_name,
      subject_class: mapping.subject_class
    })));
  } catch (error) {
    console.error('Error fetching subject-class combinations:', error);
    res.status(500).json({ error: 'Failed to fetch combinations', details: error.message });
  }
});

// Route to get mark list forms for a teacher
router.get('/teacher-mark-lists/:teacherName', async (req, res) => {
  const { teacherName } = req.params;
  
  console.log(`\n========== TEACHER MARK LISTS REQUEST ==========`);
  console.log(`Teacher Name (from URL): "${teacherName}"`);
  console.log(`Teacher Name (decoded): "${decodeURIComponent(teacherName)}"`);
  
  try {
    // Get teacher's assigned subject-class combinations
    const assignmentsResult = await pool.query(
      'SELECT subject_class FROM subjects_of_school_schema.teachers_subjects WHERE teacher_name = $1',
      [teacherName]
    );
    
    console.log(`Found ${assignmentsResult.rows.length} assignments in database`);
    console.log(`Assignments:`, assignmentsResult.rows);
    
    if (assignmentsResult.rows.length === 0) {
      console.log(`No assignments found - returning empty array`);
      return res.json({ message: 'No subjects assigned to this teacher', assignments: [] });
    }
    
    const assignments = assignmentsResult.rows;
    const markListForms = [];
    
    // Get term count
    const configResult = await pool.query('SELECT term_count FROM subjects_of_school_schema.school_config WHERE id = 1');
    const termCount = configResult.rows[0]?.term_count || 2;
    
    console.log(`Term count: ${termCount}`);
    
    for (const assignment of assignments) {
      // Parse subject and class from subject_class string
      const match = assignment.subject_class.match(/^(.+) Class (.+)$/);
      if (match) {
        const [, subjectName, className] = match;
        
        console.log(`Processing: ${subjectName} Class ${className}`);
        
        // Check which terms have mark list forms
        const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
        
        for (let term = 1; term <= termCount; term++) {
          const tableName = `${className.toLowerCase()}_term_${term}`;
          
          try {
            // Check if table exists
            const tableExistsResult = await pool.query(`
              SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = $1 AND table_name = $2
              )
            `, [schemaName, tableName]);
            
            if (tableExistsResult.rows[0].exists) {
              markListForms.push({
                subjectName,
                className,
                termNumber: term,
                subjectClass: assignment.subject_class,
                formId: `${subjectName}_${className}_${term}`
              });
              console.log(`✓ Added: ${subjectName} Class ${className} Term ${term}`);
            } else {
              console.log(`✗ Table not found: ${schemaName}.${tableName}`);
            }
          } catch (error) {
            console.log(`Error checking table ${schemaName}.${tableName}:`, error.message);
          }
        }
      } else {
        console.log(`Could not parse subject_class: ${assignment.subject_class}`);
      }
    }
    
    console.log(`Returning ${markListForms.length} mark list forms`);
    console.log(`================================================\n`);
    
    res.json({
      teacherName,
      assignments: markListForms
    });
  } catch (error) {
    console.error('Error fetching teacher mark lists:', error);
    res.status(500).json({ error: 'Failed to fetch teacher mark lists', details: error.message });
  }
});

// Route to calculate and update all totals for a specific mark list
router.post('/calculate-totals', async (req, res) => {
  const { subjectName, termNumber } = req.body;
  const className = req.body.className?.toLowerCase();
  
  if (!subjectName || !className || !termNumber) {
    return res.status(400).json({ error: 'Subject name, class name, and term number are required' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
    const tableName = `${className.toLowerCase()}_term_${termNumber}`;
    
    // Get form configuration
    const configResult = await client.query(
      `SELECT * FROM ${schemaName}.form_config WHERE class_name = $1 AND term_number = $2`,
      [className, termNumber]
    );
    
    if (configResult.rows.length === 0) {
      throw new Error('Form configuration not found');
    }
    
    const config = configResult.rows[0];
    const markComponents = config.mark_components;
    
    // Get all students
    const studentsResult = await client.query(`SELECT id FROM ${schemaName}.${tableName}`);
    
    for (const student of studentsResult.rows) {
      // Calculate total for this student
      let total = 0;
      const componentColumns = markComponents.map(comp => 
        comp.name.toLowerCase().replace(/[\s\-\.]+/g, '_')
      );
      
      const studentDataResult = await client.query(
        `SELECT ${componentColumns.join(', ')} FROM ${schemaName}.${tableName} WHERE id = $1`,
        [student.id]
      );
      
      if (studentDataResult.rows.length > 0) {
        const studentData = studentDataResult.rows[0];
        
        markComponents.forEach(component => {
          const componentKey = component.name.toLowerCase().replace(/[\s\-\.]+/g, '_');
          const mark = parseFloat(studentData[componentKey]) || 0;
          const maxMark = component.percentage;
          total += Math.min(mark, maxMark);
        });
        
        // Ensure total doesn't exceed 100
        total = Math.min(total, 100);
        
        // Determine pass status
        const passStatus = total >= config.pass_threshold ? 'Pass' : 'Fail';
        
        // Update student record
        await client.query(
          `UPDATE ${schemaName}.${tableName} 
           SET total = $1, pass_status = $2, updated_at = CURRENT_TIMESTAMP 
           WHERE id = $3`,
          [total, passStatus, student.id]
        );
      }
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Totals calculated and updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error calculating totals:', error);
    res.status(500).json({ error: 'Failed to calculate totals', details: error.message });
  } finally {
    client.release();
  }
});

// Route to get comprehensive class ranking with detailed breakdown
router.get('/comprehensive-ranking/:className/:termNumber', async (req, res) => {
  const { termNumber } = req.params;
  const className = req.params.className.toLowerCase();
  
  try {
    // Validate class exists in classes_schema (case-insensitive)
    const classResult = await pool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'classes_schema' AND LOWER(table_name) = LOWER($1)`,
      [className]
    );
    if (classResult.rows.length === 0) {
      return res.status(404).json({ error: `Class ${className} not found in classes_schema` });
    }
    const actualClassName = classResult.rows[0].table_name;
    
    // Get subjects for this class from subject_class_mappings
    const subjectsResult = await pool.query(
      'SELECT subject_name FROM subjects_of_school_schema.subject_class_mappings WHERE LOWER(class_name) = LOWER($1)',
      [className]
    );
    
    const subjects = subjectsResult.rows;
    const studentData = {};
    const subjectDetails = {};
    
    // Get marks from each subject
    for (const subject of subjects) {
      const subjectName = subject.subject_name;
      const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
      const tableName = `${className.toLowerCase()}_term_${termNumber}`;
      
      try {
        // Get marks and form configuration
        const [marksResult, configResult] = await Promise.all([
          pool.query(`SELECT student_name, total, pass_status FROM ${schemaName}.${tableName}`),
          pool.query(`SELECT * FROM ${schemaName}.form_config WHERE class_name = $1 AND term_number = $2`, 
                    [className, termNumber])
        ]);
        
        subjectDetails[subjectName] = {
          config: configResult.rows[0] || null,
          hasData: marksResult.rows.length > 0
        };
        
        for (const mark of marksResult.rows) {
          if (!studentData[mark.student_name]) {
            studentData[mark.student_name] = {
              studentName: mark.student_name,
              subjects: {},
              totalMarks: 0,
              subjectCount: 0,
              passedSubjects: 0,
              failedSubjects: 0
            };
          }
          
          const total = Math.min(mark.total || 0, 100);
          studentData[mark.student_name].subjects[subjectName] = {
            total: total,
            status: mark.pass_status || 'Fail'
          };
          studentData[mark.student_name].totalMarks += total;
          studentData[mark.student_name].subjectCount++;
          
          if (mark.pass_status === 'Pass') {
            studentData[mark.student_name].passedSubjects++;
          } else {
            studentData[mark.student_name].failedSubjects++;
          }
        }
      } catch (error) {
        console.log(`Mark list not found for ${subjectName} ${className} term ${termNumber}`);
        subjectDetails[subjectName] = {
          config: null,
          hasData: false
        };
      }
    }
    
    // Filter out deactivated students by checking classes_schema
    const activeStudentNames = new Set();
    try {
      const activeStudentsResult = await pool.query(`
        SELECT student_name 
        FROM classes_schema."${actualClassName}" 
        WHERE is_active = TRUE OR is_active IS NULL
      `);
      activeStudentsResult.rows.forEach(row => activeStudentNames.add(row.student_name));
    } catch (error) {
      console.log('Could not check student active status, showing all students');
      // If column doesn't exist, show all students
      Object.keys(studentData).forEach(name => activeStudentNames.add(name));
    }
    
    // Calculate averages and rankings only for active students
    const rankings = Object.values(studentData)
      .filter(student => activeStudentNames.has(student.studentName))
      .map(student => ({
        ...student,
        average: student.subjectCount > 0 ? student.totalMarks / student.subjectCount : 0,
        overallStatus: student.failedSubjects === 0 && student.subjectCount > 0 ? 'Pass' : 'Fail'
      }));
    
    // Sort by average (descending) and assign ranks
    rankings.sort((a, b) => {
      if (b.average !== a.average) {
        return b.average - a.average;
      }
      // If averages are equal, sort by total marks
      return b.totalMarks - a.totalMarks;
    });
    
    rankings.forEach((student, index) => {
      student.rank = index + 1;
      // Add ordinal suffix
      const rank = student.rank;
      let suffix = 'th';
      if (rank % 10 === 1 && rank % 100 !== 11) suffix = 'st';
      else if (rank % 10 === 2 && rank % 100 !== 12) suffix = 'nd';
      else if (rank % 10 === 3 && rank % 100 !== 13) suffix = 'rd';
      student.rankDisplay = `${rank}${suffix}`;
    });
    
    res.json({
      className,
      termNumber,
      rankings,
      subjects: subjects.map(s => s.subject_name),
      subjectDetails,
      summary: {
        totalStudents: rankings.length,
        totalSubjects: subjects.length,
        averageClassScore: rankings.length > 0 ? 
          rankings.reduce((sum, s) => sum + s.average, 0) / rankings.length : 0,
        passRate: rankings.length > 0 ? 
          (rankings.filter(s => s.overallStatus === 'Pass').length / rankings.length) * 100 : 0
      }
    });
  } catch (error) {
    console.error('Error calculating comprehensive ranking:', error);
    res.status(500).json({ error: 'Failed to calculate ranking', details: error.message });
  }
});

// Route to get full ranking across all terms for report card
router.get('/full-ranking/:className', async (req, res) => {
  const className = req.params.className.toLowerCase();
  
  try {
    // Validate class exists (case-insensitive)
    const classResult = await pool.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'classes_schema' AND LOWER(table_name) = LOWER($1)`,
      [className]
    );
    if (classResult.rows.length === 0) {
      return res.status(404).json({ error: `Class ${className} not found in classes_schema` });
    }
    const actualClassName = classResult.rows[0].table_name;
    
    // Fetch term count from school_config
    const configResult = await pool.query(
      'SELECT term_count FROM subjects_of_school_schema.school_config WHERE id = 1'
    );
    const termCount = configResult.rows.length > 0 ? configResult.rows[0].term_count : 2;
    
    // Get subjects for this class, sorted alphabetically
    const subjectsResult = await pool.query(
      'SELECT subject_name FROM subjects_of_school_schema.subject_class_mappings WHERE LOWER(class_name) = LOWER($1) ORDER BY subject_name ASC',
      [className]
    );
    const subjects = subjectsResult.rows.map(s => s.subject_name);
    
    // Fetch data for each term
    const terms = [];
    for (let termNum = 1; termNum <= termCount; termNum++) {
      const studentData = {};
      const subjectDetails = {};
      
      for (const subjectName of subjects) {
        const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
        const tableName = `${className}_term_${termNum}`;
        
        try {
          const [marksResult, configResult] = await Promise.all([
            pool.query(`SELECT student_name, total, pass_status FROM ${schemaName}.${tableName}`),
            pool.query(`SELECT * FROM ${schemaName}.form_config WHERE class_name = $1 AND term_number = $2`, 
                      [className, termNum])
          ]);
          
          subjectDetails[subjectName] = {
            config: configResult.rows[0] || null,
            hasData: marksResult.rows.length > 0
          };
          
          for (const mark of marksResult.rows) {
            if (!studentData[mark.student_name]) {
              studentData[mark.student_name] = {
                studentName: mark.student_name,
                subjects: {},
                totalMarks: 0,
                subjectCount: 0,
                passedSubjects: 0,
                failedSubjects: 0
              };
            }
            const total = Math.min(mark.total || 0, 100);
            studentData[mark.student_name].subjects[subjectName] = {
              total: total,
              status: mark.pass_status || 'Fail'
            };
            studentData[mark.student_name].totalMarks += total;
            studentData[mark.student_name].subjectCount++;
            
            if (mark.pass_status === 'Pass') {
              studentData[mark.student_name].passedSubjects++;
            } else {
              studentData[mark.student_name].failedSubjects++;
            }
          }
        } catch (error) {
          subjectDetails[subjectName] = { config: null, hasData: false };
        }
      }
      
      // Filter active students and calculate rankings
      const activeStudentNames = new Set();
      try {
        const activeStudentsResult = await pool.query(
          `SELECT student_name FROM classes_schema."${actualClassName}" WHERE is_active = TRUE OR is_active IS NULL`
        );
        activeStudentsResult.rows.forEach(row => activeStudentNames.add(row.student_name));
      } catch (error) {
        Object.keys(studentData).forEach(name => activeStudentNames.add(name));
      }
      
      const rankings = Object.values(studentData)
        .filter(student => activeStudentNames.has(student.studentName))
        .map(student => ({
          ...student,
          average: student.subjectCount > 0 ? student.totalMarks / student.subjectCount : 0,
          overallStatus: student.failedSubjects === 0 && student.subjectCount > 0 ? 'Pass' : 'Fail'
        }));
      
      rankings.sort((a, b) => {
        if (b.average !== a.average) return b.average - a.average;
        return b.totalMarks - a.totalMarks;
      });
      
      const hasAnyMarks = rankings.some(s => s.totalMarks > 0);
      if (hasAnyMarks) {
        rankings.forEach((student, index) => {
          student.rank = index + 1;
          const rank = student.rank;
          let suffix = 'th';
          if (rank % 10 === 1 && rank % 100 !== 11) suffix = 'st';
          else if (rank % 10 === 2 && rank % 100 !== 12) suffix = 'nd';
          else if (rank % 10 === 3 && rank % 100 !== 13) suffix = 'rd';
          student.rankDisplay = `${rank}${suffix}`;
        });
      }
      
      terms.push({
        termNumber: termNum,
        rankings,
        subjects,
        subjectDetails,
        summary: {
          totalStudents: rankings.length,
          totalSubjects: subjects.length,
          averageClassScore: rankings.length > 0 ? 
            rankings.reduce((sum, s) => sum + s.average, 0) / rankings.length : 0,
          passRate: rankings.length > 0 ? 
            (rankings.filter(s => s.overallStatus === 'Pass').length / rankings.length) * 100 : 0
        }
      });
    }
    
    res.json({
      className,
      termCount,
      terms,
      allSubjects: subjects
    });
  } catch (error) {
    console.error('Error calculating full ranking:', error);
    res.status(500).json({ error: 'Failed to calculate full ranking', details: error.message });
  }
});

// Route to get mark list statistics
router.get('/statistics/:subjectName/:className/:termNumber', async (req, res) => {
  const { subjectName, termNumber } = req.params;
  const className = req.params.className.toLowerCase();
  
  try {
    const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
    const tableName = `${className.toLowerCase()}_term_${termNumber}`;
    
    // Get all marks
    const marksResult = await pool.query(`
      SELECT total, pass_status FROM ${schemaName}.${tableName}
      WHERE total IS NOT NULL
    `);
    
    if (marksResult.rows.length === 0) {
      return res.json({ message: 'No marks found', statistics: null });
    }
    
    const marks = marksResult.rows.map(row => row.total);
    const passCount = marksResult.rows.filter(row => row.pass_status === 'Pass').length;
    const failCount = marksResult.rows.length - passCount;
    
    // Calculate statistics
    const total = marks.reduce((sum, mark) => sum + mark, 0);
    const average = total / marks.length;
    const highest = Math.max(...marks);
    const lowest = Math.min(...marks);
    
    // Calculate median
    const sortedMarks = [...marks].sort((a, b) => a - b);
    const median = sortedMarks.length % 2 === 0
      ? (sortedMarks[sortedMarks.length / 2 - 1] + sortedMarks[sortedMarks.length / 2]) / 2
      : sortedMarks[Math.floor(sortedMarks.length / 2)];
    
    // Grade distribution
    const gradeDistribution = {
      'A (90-100)': marks.filter(m => m >= 90).length,
      'B (80-89)': marks.filter(m => m >= 80 && m < 90).length,
      'C (70-79)': marks.filter(m => m >= 70 && m < 80).length,
      'D (60-69)': marks.filter(m => m >= 60 && m < 70).length,
      'F (0-59)': marks.filter(m => m < 60).length
    };
    
    res.json({
      subjectName,
      className,
      termNumber,
      statistics: {
        totalStudents: marks.length,
        average: Math.round(average * 100) / 100,
        highest,
        lowest,
        median: Math.round(median * 100) / 100,
        passCount,
        failCount,
        passRate: Math.round((passCount / marks.length) * 100 * 100) / 100,
        gradeDistribution
      }
    });
  } catch (error) {
    console.error('Error calculating statistics:', error);
    res.status(500).json({ error: 'Failed to calculate statistics', details: error.message });
  }
});

router.get('/classes/:teacherId', async (req, res) => {
  const { teacherId } = req.params;
  try {
    const { getTeacherClasses } = require('../utils/permissions');
    const classes = await getTeacherClasses(teacherId);
    res.json({ classes });
  } catch (error) {
    console.error('Error fetching teacher classes:', error);
    res.status(500).json({ error: 'Failed to fetch classes', details: error.message });
  }
});

// Route to bulk update marks (for importing from spreadsheet)
router.post('/bulk-update-marks', async (req, res) => {
  const { subjectName, termNumber, marksData } = req.body;
  const className = req.body.className?.toLowerCase();
  
  if (!subjectName || !className || !termNumber || !marksData || !Array.isArray(marksData)) {
    return res.status(400).json({ error: 'All fields are required and marksData must be an array' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
    const tableName = `${className.toLowerCase()}_term_${termNumber}`;
    
    // Get form configuration
    const configResult = await client.query(
      `SELECT * FROM ${schemaName}.form_config WHERE class_name = $1 AND term_number = $2`,
      [className, termNumber]
    );
    
    if (configResult.rows.length === 0) {
      throw new Error('Form configuration not found');
    }
    
    const config = configResult.rows[0];
    const markComponents = config.mark_components;
    
    let updatedCount = 0;
    
    for (const studentMarks of marksData) {
      const { studentName, marks } = studentMarks;
      
      if (!studentName || !marks) continue;
      
      // Find student by name
      const studentResult = await client.query(
        `SELECT id FROM ${schemaName}.${tableName} WHERE LOWER(student_name) = LOWER($1)`,
        [studentName]
      );
      
      if (studentResult.rows.length === 0) {
        console.log(`Student not found: ${studentName}`);
        continue;
      }
      
      const studentId = studentResult.rows[0].id;
      
      // Build update query
      const updateColumns = [];
      const updateValues = [];
      let total = 0;
      
      for (const component of markComponents) {
        const componentKey = component.name.toLowerCase().replace(/[\s\-\.]+/g, '_');
        if (marks[componentKey] !== undefined) {
          const mark = parseFloat(marks[componentKey]);
          const maxMark = component.percentage;
          
          // Ensure mark doesn't exceed component percentage
          const finalMark = Math.min(mark, maxMark);
          updateColumns.push(`${componentKey} = $${updateValues.length + 1}`);
          updateValues.push(finalMark);
          total += finalMark;
        }
      }
      
      if (updateColumns.length === 0) continue;
      
      // Ensure total doesn't exceed 100
      total = Math.min(total, 100);
      
      // Determine pass status
      const passStatus = total >= config.pass_threshold ? 'Pass' : 'Fail';
      
      updateColumns.push(`total = $${updateValues.length + 1}`);
      updateValues.push(total);
      updateColumns.push(`pass_status = $${updateValues.length + 1}`);
      updateValues.push(passStatus);
      updateColumns.push(`updated_at = CURRENT_TIMESTAMP`);
      
      updateValues.push(studentId);
      
      const updateQuery = `
        UPDATE ${schemaName}.${tableName} 
        SET ${updateColumns.join(', ')} 
        WHERE id = $${updateValues.length}
      `;
      
      await client.query(updateQuery, updateValues);
      updatedCount++;
    }
    
    await client.query('COMMIT');
    res.json({ 
      message: `Bulk update completed successfully. ${updatedCount} students updated.`,
      updatedCount 
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in bulk update:', error);
    res.status(500).json({ error: 'Failed to bulk update marks', details: error.message });
  } finally {
    client.release();
  }
});

// Route to assign teachers to subject-class combinations
router.post('/assign-teachers', async (req, res) => {
  const { assignments } = req.body; // Array of { teacherName, subjectClass }
  
  if (!assignments || !Array.isArray(assignments)) {
    return res.status(400).json({ error: 'Assignments array is required' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Clear ALL existing assignments to replace with new ones
    await client.query('DELETE FROM subjects_of_school_schema.teachers_subjects');
    
    // Validate and insert new assignments
    for (const assignment of assignments) {
      if (!assignment.teacherName || !assignment.subjectClass) {
        continue;
      }
      
      // Validate subject_class exists
      const mappingResult = await client.query(
        'SELECT subject_class FROM subjects_of_school_schema.subject_class_mappings WHERE LOWER(subject_class) = LOWER($1)',
        [assignment.subjectClass]
      );
      if (mappingResult.rows.length === 0) {
        throw new Error(`Subject-class combination ${assignment.subjectClass} not found`);
      }
      
      // Validate teacher exists (basic check; expand as needed)
      const teacherSchemasResult = await client.query(`
        SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'staff_%'
      `);
      let teacherExists = false;
      for (const schema of teacherSchemasResult.rows) {
        const schemaName = schema.schema_name;
        const tablesResult = await client.query(`
          SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name != 'staff_counter'
        `, [schemaName]);
        for (const table of tablesResult.rows) {
          const tableName = table.table_name;
          const teacherCheck = await client.query(`
            SELECT name FROM "${schemaName}"."${tableName}" WHERE LOWER(name) = LOWER($1) AND role = 'Teacher'
          `, [assignment.teacherName]);
          if (teacherCheck.rows.length > 0) {
            teacherExists = true;
            break;
          }
        }
        if (teacherExists) break;
      }
      if (!teacherExists) {
        throw new Error(`Teacher ${assignment.teacherName} not found`);
      }
      
      // Insert assignment
      await client.query(
        `INSERT INTO subjects_of_school_schema.teachers_subjects (teacher_name, subject_class) 
         VALUES ($1, $2)`,
        [assignment.teacherName, assignment.subjectClass]
      );
    }
    
    await client.query('COMMIT');
    res.json({ message: 'Teachers assigned successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error assigning teachers:', error);
    res.status(500).json({ error: 'Failed to assign teachers', details: error.message });
  } finally {
    client.release();
  }
});

// Route to get teacher assignments
router.get('/teacher-assignments', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT teacher_name, subject_class, created_at 
      FROM subjects_of_school_schema.teachers_subjects 
      ORDER BY teacher_name, subject_class
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching teacher assignments:', error);
    res.status(500).json({ error: 'Failed to fetch assignments', details: error.message });
  }
});

// Route to auto-populate teacher assignments from schedule config (Task6)
router.get('/auto-connect-teachers', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT teacher_name, subject_class 
      FROM schedule_schema.class_subject_configs 
      WHERE teacher_name IS NOT NULL AND teacher_name != ''
      ORDER BY teacher_name, subject_class
    `);
    res.json(result.rows.map(r => ({
      teacher_name: r.teacher_name,
      subject_class: r.subject_class
    })));
  } catch (error) {
    console.error('Error fetching schedule teacher connections:', error);
    res.status(500).json({ error: 'Failed to fetch schedule teacher connections', details: error.message });
  }
});

// Route to get all marks for a specific student
router.get('/student-marks/:schoolId/:className', async (req, res) => {
  const { schoolId } = req.params;
  const className = req.params.className.toLowerCase();
  
  try {
    // First, get the student's name from their school_id
    let studentName = null;
    try {
      // Check if is_active column exists
      const columnCheck = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'classes_schema' 
          AND table_name = $1 
          AND column_name = 'is_active'
      `, [className]);
      
      const hasIsActive = columnCheck.rows.length > 0;
      const whereClause = hasIsActive ? 'AND (is_active = TRUE OR is_active IS NULL)' : '';
      
      const studentResult = await pool.query(`
        SELECT student_name FROM classes_schema."${className}" 
        WHERE school_id = $1 ${whereClause}
      `, [schoolId]);
      if (studentResult.rows.length > 0) {
        studentName = studentResult.rows[0].student_name;
      }
    } catch (e) {
      // Try alternative: get from any class table
      const tablesResult = await pool.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'classes_schema'
      `);
      for (const table of tablesResult.rows) {
        try {
          // Check if is_active column exists for this table
          const columnCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'classes_schema' 
              AND table_name = $1 
              AND column_name = 'is_active'
          `, [table.table_name]);
          
          const hasIsActive = columnCheck.rows.length > 0;
          const whereClause = hasIsActive ? 'AND (is_active = TRUE OR is_active IS NULL)' : '';
          
          const result = await pool.query(`
            SELECT student_name FROM classes_schema."${table.table_name}" 
            WHERE school_id = $1 ${whereClause}
          `, [schoolId]);
          if (result.rows.length > 0) {
            studentName = result.rows[0].student_name;
            break;
          }
        } catch (err) {
          continue;
        }
      }
    }
    
    if (!studentName) {
      return res.json({ marks: [], message: 'Student not found' });
    }
    
    // Get all subjects mapped to this class
    const subjectsResult = await pool.query(`
      SELECT subject_name 
      FROM subjects_of_school_schema.subject_class_mappings 
      WHERE LOWER(class_name) = LOWER($1)
    `, [className]);
    
    const marks = [];
    
    for (const subjectRow of subjectsResult.rows) {
      const subjectName = subjectRow.subject_name;
      const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
      
      // Check all terms (1-4)
      for (let term = 1; term <= 4; term++) {
        const tableName = `${className.toLowerCase().replace(/[\s\-\.]+/g, '_')}_term_${term}`;
        
        try {
          // Check if table exists and get student's marks by student_name
          const studentMarks = await pool.query(`
            SELECT * FROM ${schemaName}.${tableName} 
            WHERE student_name = $1
          `, [studentName]);
          
          if (studentMarks.rows.length > 0) {
            const studentData = studentMarks.rows[0];
            
            // Get form config for mark components
            const configResult = await pool.query(`
              SELECT mark_components FROM ${schemaName}.form_config 
              WHERE class_name = $1 AND term_number = $2
            `, [className, term]);
            
            const components = [];
            if (configResult.rows.length > 0 && configResult.rows[0].mark_components) {
              for (const comp of configResult.rows[0].mark_components) {
                const compKey = comp.name.toLowerCase().replace(/[\s\-\.]+/g, '_');
                components.push({
                  name: comp.name,
                  score: studentData[compKey] || 0,
                  max: comp.percentage
                });
              }
            }
            
            marks.push({
              subject_name: subjectName,
              term_number: term,
              total: studentData.total || 0,
              pass_status: studentData.pass_status || 'N/A',
              components
            });
          }
        } catch (tableError) {
          // Table doesn't exist for this term, skip
          continue;
        }
      }
    }
    
    res.json({ marks });
  } catch (error) {
    console.error('Error fetching student marks:', error);
    res.status(500).json({ error: 'Failed to fetch student marks', details: error.message });
  }
});

// Route to sync all mark lists for a class (add new students, remove deactivated)
router.post('/sync-class-students/:className', async (req, res) => {
  const className = req.params.className.toLowerCase();
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Resolve actual class name (case-insensitive)
    const classResult = await client.query(
      `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = 'classes_schema' AND LOWER(table_name) = LOWER($1)`,
      [className]
    );
    if (classResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: `Class ${className} not found` });
    }
    const actualClassName = classResult.rows[0].table_name;
    
    // Check if is_active column exists
    const whereClause = await getActiveStudentsWhereClause(client, actualClassName);
    
    // Get all active students from the class
    const activeStudentsResult = await client.query(
      `SELECT student_name, age, gender FROM classes_schema."${actualClassName}" 
       ${whereClause}`
    );
    const activeStudents = activeStudentsResult.rows;
    const activeStudentNames = activeStudents.map(s => s.student_name);
    
    // Get all subjects mapped to this class
    const subjectMappingsResult = await client.query(
      `SELECT subject_name FROM subjects_of_school_schema.subject_class_mappings 
       WHERE LOWER(class_name) = LOWER($1)`,
      [className]
    );
    
    // Get term count
    const configResult = await client.query(
      'SELECT term_count FROM subjects_of_school_schema.school_config WHERE id = 1'
    );
    const termCount = configResult.rows[0]?.term_count || 2;
    
    let totalAdded = 0;
    let totalRemoved = 0;
    const syncedTables = [];
    
    // For each subject-class combination
    for (const mapping of subjectMappingsResult.rows) {
      const subjectName = mapping.subject_name;
      const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
      
      // For each term
      for (let term = 1; term <= termCount; term++) {
        const tableName = `${className.toLowerCase()}_term_${term}`;
        
        try {
          // Check if table exists
          const tableExistsResult = await client.query(`
            SELECT EXISTS (
              SELECT FROM information_schema.tables 
              WHERE table_schema = $1 AND table_name = $2
            )
          `, [schemaName, tableName]);
          
          if (!tableExistsResult.rows[0].exists) continue;
          
          // Get current students in mark list
          const markListResult = await client.query(
            `SELECT student_name FROM ${schemaName}.${tableName}`
          );
          const markListStudents = markListResult.rows.map(r => r.student_name);
          
          // Find students to add
          const studentsToAdd = activeStudents.filter(
            student => !markListStudents.includes(student.student_name)
          );
          
          // Find students to remove
          const studentsToRemove = markListStudents.filter(
            name => !activeStudentNames.includes(name)
          );
          
          // Add new students
          for (const student of studentsToAdd) {
            await client.query(
              `INSERT INTO ${schemaName}.${tableName} (student_name, age, gender) 
               VALUES ($1, $2, $3)`,
              [student.student_name, student.age, student.gender]
            );
            totalAdded++;
          }
          
          // Remove deactivated students
          for (const studentName of studentsToRemove) {
            await client.query(
              `DELETE FROM ${schemaName}.${tableName} WHERE student_name = $1`,
              [studentName]
            );
            totalRemoved++;
          }
          
          if (studentsToAdd.length > 0 || studentsToRemove.length > 0) {
            syncedTables.push({
              subject: subjectName,
              term: term,
              added: studentsToAdd.length,
              removed: studentsToRemove.length
            });
          }
        } catch (tableError) {
          console.log(`Error syncing ${schemaName}.${tableName}:`, tableError.message);
          continue;
        }
      }
    }
    
    await client.query('COMMIT');
    res.json({
      message: 'Class students synced successfully',
      className,
      totalAdded,
      totalRemoved,
      syncedTables
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error syncing class students:', error);
    res.status(500).json({ error: 'Failed to sync class students', details: error.message });
  } finally {
    client.release();
  }
});

// Get all marks for all wards of a guardian
router.get('/guardian-marks/:guardianUsername', async (req, res) => {
  const { guardianUsername } = req.params;
  
  const client = await pool.connect();
  try {
    // Get all class tables
    const tablesResult = await client.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1', 
      ['classes_schema']
    );
    
    const classes = tablesResult.rows.map(row => row.table_name);
    const wards = [];
    
    // Find all wards for this guardian
    for (const className of classes) {
      try {
        const columnsCheck = await client.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'classes_schema' 
            AND table_name = $1 
            AND column_name = 'is_active'
        `, [className]);
        
        const hasIsActive = columnsCheck.rows.length > 0;
        const whereClause = hasIsActive 
          ? `WHERE guardian_username = $1 AND (is_active = TRUE OR is_active IS NULL)`
          : `WHERE guardian_username = $1`;
        
        const result = await client.query(`
          SELECT 
            student_name,
            school_id,
            class_id,
            class,
            age,
            gender
          FROM classes_schema."${className}"
          ${whereClause}
        `, [guardianUsername]);
        
        wards.push(...result.rows.map(row => ({
          ...row,
          class: row.class || className
        })));
      } catch (err) {
        console.warn(`Error fetching from ${className}:`, err.message);
      }
    }
    
    if (wards.length === 0) {
      return res.json({
        success: true,
        data: {
          wards: [],
          marks: []
        }
      });
    }
    
    // Get all subjects
    const subjectsResult = await client.query(
      'SELECT subject_name FROM subjects_of_school_schema.subjects ORDER BY subject_name'
    );
    const subjects = subjectsResult.rows.map(r => r.subject_name);
    
    // Get term count
    const configResult = await client.query(
      'SELECT term_count FROM subjects_of_school_schema.school_config WHERE id = 1'
    );
    const termCount = configResult.rows[0]?.term_count || 2;
    
    // Fetch marks for each ward
    const marksData = [];
    
    for (const ward of wards) {
      for (const subjectName of subjects) {
        const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
        
        for (let term = 1; term <= termCount; term++) {
          const tableName = `${ward.class.toLowerCase()}_term_${term}`;
          
          try {
            // Check if table exists
            const tableExistsResult = await client.query(`
              SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = $1 AND table_name = $2
              )
            `, [schemaName, tableName]);
            
            if (tableExistsResult.rows[0].exists) {
              // Get marks for this student
              const marksResult = await client.query(`
                SELECT * FROM ${schemaName}.${tableName}
                WHERE student_name = $1
              `, [ward.student_name]);
              
              if (marksResult.rows.length > 0) {
                const mark = marksResult.rows[0];
                marksData.push({
                  ward: ward.student_name,
                  class: ward.class,
                  subject: subjectName,
                  term: term,
                  total: mark.total || 0,
                  pass_status: mark.pass_status || 'Fail',
                  details: mark
                });
              }
            }
          } catch (error) {
            console.warn(`Error fetching marks for ${ward.student_name} in ${subjectName}:`, error.message);
          }
        }
      }
    }
    
    res.json({
      success: true,
      data: {
        wards: wards,
        marks: marksData,
        subjects: subjects,
        termCount: termCount
      }
    });
  } catch (error) {
    console.error('Error fetching guardian marks:', error);
    res.status(500).json({ error: 'Failed to fetch guardian marks', details: error.message });
  } finally {
    client.release();
  }
});

// Route to lock mark list (prevent further editing)
router.post('/lock-marks', async (req, res) => {
  const { subjectName, termNumber, lockedBy } = req.body;
  const className = req.body.className?.toLowerCase();
  
  if (!subjectName || !className || !termNumber) {
    return res.status(400).json({ error: 'Subject name, class name, and term number are required' });
  }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
    const tableName = `${className.toLowerCase()}_term_${termNumber}`;
    
    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = $2
      )
    `, [schemaName, tableName]);
    
    if (!tableCheck.rows[0].exists) {
      return res.status(404).json({ error: 'Mark list not found' });
    }
    
    // Check if is_locked column exists, if not add it
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = $1 AND table_name = $2 AND column_name = 'is_locked'
    `, [schemaName, tableName]);
    
    if (columnCheck.rows.length === 0) {
      // Add is_locked, locked_at, locked_by columns
      await client.query(`
        ALTER TABLE ${schemaName}.${tableName}
        ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS locked_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS locked_by VARCHAR(100)
      `);
    }
    
    // Lock all marks in this table
    await client.query(`
      UPDATE ${schemaName}.${tableName}
      SET is_locked = TRUE, locked_at = NOW(), locked_by = $1
    `, [lockedBy || 'admin']);
    
    // Update form_config to mark as locked
    await client.query(`
      UPDATE ${schemaName}.form_config
      SET is_locked = TRUE, locked_at = NOW(), locked_by = $1
      WHERE class_name = $2 AND term_number = $3
    `, [lockedBy || 'admin', className, termNumber]);
    
    await client.query('COMMIT');
    res.json({ 
      message: 'Mark list locked successfully',
      lockedAt: new Date(),
      lockedBy: lockedBy || 'admin'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error locking marks:', error);
    res.status(500).json({ error: 'Failed to lock marks', details: error.message });
  } finally {
    client.release();
  }
});

// Route to unlock mark list (admin only)
router.post('/unlock-marks', async (req, res) => {
  const { subjectName, termNumber, unlockedBy } = req.body;
  const className = req.body.className?.toLowerCase();
  
  if (!subjectName || !className || !termNumber) {
    return res.status(400).json({ error: 'Subject name, class name, and term number are required' });
  }
  
  // TODO: Add admin permission check here
  // if (!req.user || !req.user.isAdmin) {
  //   return res.status(403).json({ error: 'Only administrators can unlock mark lists' });
  // }
  
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
    const tableName = `${className.toLowerCase()}_term_${termNumber}`;
    
    // Check if table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = $1 AND table_name = $2
      )
    `, [schemaName, tableName]);
    
    if (!tableCheck.rows[0].exists) {
      return res.status(404).json({ error: 'Mark list not found' });
    }
    
    // Unlock all marks in this table
    await client.query(`
      UPDATE ${schemaName}.${tableName}
      SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
    `);
    
    // Update form_config to mark as unlocked
    await client.query(`
      UPDATE ${schemaName}.form_config
      SET is_locked = FALSE, locked_at = NULL, locked_by = NULL
      WHERE class_name = $1 AND term_number = $2
    `, [className, termNumber]);
    
    await client.query('COMMIT');
    res.json({ 
      message: 'Mark list unlocked successfully',
      unlockedAt: new Date(),
      unlockedBy: unlockedBy || 'admin'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error unlocking marks:', error);
    res.status(500).json({ error: 'Failed to unlock marks', details: error.message });
  } finally {
    client.release();
  }
});

// Route to check lock status
router.get('/lock-status/:subjectName/:className/:termNumber', async (req, res) => {
  const { subjectName, termNumber } = req.params;
  const className = req.params.className.toLowerCase();
  
  const client = await pool.connect();
  try {
    const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
    
    // Get lock status from form_config
    const result = await client.query(`
      SELECT is_locked, locked_at, locked_by
      FROM ${schemaName}.form_config
      WHERE class_name = $1 AND term_number = $2
    `, [className, termNumber]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mark list configuration not found' });
    }
    
    const config = result.rows[0];
    res.json({
      isLocked: config.is_locked || false,
      lockedAt: config.locked_at,
      lockedBy: config.locked_by
    });
  } catch (error) {
    console.error('Error checking lock status:', error);
    res.status(500).json({ error: 'Failed to check lock status', details: error.message });
  } finally {
    client.release();
  }
});

// DELETE /api/mark-list/delete-mark-form/:subjectName/:className/:termNumber
// Delete a mark list form (table + config)
router.delete('/delete-mark-form/:subjectName/:className/:termNumber', async (req, res) => {
  const { subjectName, className, termNumber } = req.params;
  const client = await pool.connect();
  try {
    const schemaName = `subject_${subjectName.toLowerCase().replace(/[\s\-\.]+/g, '_')}_schema`;
    const tableName = `${className.toLowerCase()}_term_${termNumber}`;
    
    // Drop the mark list table
    await client.query(`DROP TABLE IF EXISTS ${schemaName}.${tableName}`);
    // Drop schema if empty
    await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`);
    
    res.json({ message: `Mark list deleted: ${subjectName} / ${className} / Term ${termNumber}` });
  } catch (error) {
    console.error('Error deleting mark list:', error);
    res.status(500).json({ error: 'Failed to delete mark list' });
  } finally {
    client.release();
  }
});

module.exports = router;


