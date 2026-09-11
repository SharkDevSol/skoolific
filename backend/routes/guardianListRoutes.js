const express = require("express");
const router = express.Router();
const { authenticateWithBranch } = require('../middleware/branchAuth');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

// Get all unique guardians aggregated from all class tables
router.get("/guardians", authenticateWithBranch, async (req, res) => {
  try {
    const pool = req.branchPool;
    const dbName = await pool.query('SELECT current_database() as db');
    console.log('Guardian route DB:', dbName.rows[0].db);
    
    const tablesResult = await pool.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1', 
      ['classes_schema']
    );
    
    const classes = tablesResult.rows.map(row => row.table_name);
    console.log('Found classes:', classes);
    console.log('Class count:', classes.length);
    
    if (classes.length === 0) {
      return res.json([]);
    }

    // Aggregate guardians from all class tables
    const guardiansMap = new Map();
    let totalSkipped = 0;
    let totalProcessed = 0;
    
    for (const className of classes) {
      try {
        // First check if the table has guardian columns
        const columnsCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'classes_schema' 
            AND table_name = $1 
            AND column_name IN ('guardian_name', 'guardian_phone', 'guardian_username', 'guardian_password', 'is_active')
        `, [className]);
        
        const columnNames = columnsCheck.rows.map(r => r.column_name);
        const hasGuardianColumns = columnNames.filter(c => c.startsWith('guardian')).length >= 3;
        const hasIsActive = columnNames.includes('is_active');
        
        console.log(`Class ${className}: columns=${columnNames.length} guardianCols=${columnNames.filter(c=>c.startsWith('guardian')).length} hasGuardian=${hasGuardianColumns} hasActive=${hasIsActive}`);
        
        if (!hasGuardianColumns) {
          console.log(`Skipping class ${className}: Missing guardian columns`);
          totalSkipped++;
          continue;
        }
        totalProcessed++;
        
        // Build query with conditional is_active filter
        const whereClause = hasIsActive 
          ? `WHERE guardian_name IS NOT NULL AND guardian_name != '' AND (is_active = TRUE OR is_active IS NULL)`
          : `WHERE guardian_name IS NOT NULL AND guardian_name != ''`;
        
        const result = await pool.query(`
          SELECT 
            guardian_name,
            guardian_phone,
            guardian_relation,
            guardian_username,
            guardian_password,
            student_name,
            school_id,
            class_id,
            image_student,
            age,
            gender
          FROM classes_schema."${className}"
          ${whereClause}
        `);
        
        console.log(`Class ${className}: Found ${result.rows.length} students with guardians`);
        
        console.log(`Class ${className}: Query returned ${result.rows.length} rows`);
        
        for (const row of result.rows) {
          // Use guardian_phone as unique key (or guardian_name if no phone)
          const key = row.guardian_phone || row.guardian_name;
          
          if (guardiansMap.has(key)) {
            // Add student to existing guardian
            const guardian = guardiansMap.get(key);
            guardian.students.push({
              student_name: row.student_name,
              class: className,
              school_id: row.school_id,
              class_id: row.class_id,
              image_student: row.image_student,
              age: row.age,
              gender: row.gender
            });
          } else {
            // Create new guardian entry
            guardiansMap.set(key, {
              id: key,
              guardian_name: row.guardian_name,
              guardian_phone: row.guardian_phone || '',
              guardian_relation: row.guardian_relation || '',
              guardian_username: row.guardian_username || '',
              guardian_password: row.guardian_password || '',
              students: [{
                student_name: row.student_name,
                class: className,
                school_id: row.school_id,
                class_id: row.class_id,
                image_student: row.image_student,
                age: row.age,
                gender: row.gender
              }]
            });
          }
        }
      } catch (err) {
        console.error(`Error fetching from class ${className}:`, err.message);
        console.error('Full error:', err);
      }
    }
    
    console.log(`Total processed=${totalProcessed} skipped=${totalSkipped} guardians=${guardiansMap.size}`);
    
    const guardians = Array.from(guardiansMap.values());
    guardians.sort((a, b) => (a.guardian_name || '').localeCompare(b.guardian_name || ''));
    
    console.log(`Total unique guardians found: ${guardians.length}`);
    
    res.json(guardians);
  } catch (error) {
    console.error("Error fetching guardians:", error);
    res.status(500).json({ error: "Failed to fetch guardians", details: error.message });
  }
});


// Get students for a specific guardian
router.get("/guardian/:guardianId/students", authenticateWithBranch, async (req, res) => {
  const { guardianId } = req.params;
  const pool = req.branchPool;
  
  try {
    // Get all class tables (same pattern as studentRoutes)
    const tablesResult = await pool.query(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1', 
      ['classes_schema']
    );
    
    const classes = tablesResult.rows.map(row => row.table_name);
    const students = [];
    
    for (const className of classes) {
      try {
        // Check if table has is_active column
        const columnsCheck = await pool.query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_schema = 'classes_schema' 
            AND table_name = $1 
            AND column_name = 'is_active'
        `, [className]);
        
        const hasIsActive = columnsCheck.rows.length > 0;
        
        // Build query with conditional is_active filter
        const whereClause = hasIsActive 
          ? `WHERE (guardian_phone = $1 OR guardian_name = $1) AND (is_active = TRUE OR is_active IS NULL)`
          : `WHERE (guardian_phone = $1 OR guardian_name = $1)`;
        
        const result = await pool.query(`
          SELECT 
            student_name,
            age,
            gender,
            username,
            class
          FROM classes_schema."${className}"
          ${whereClause}
        `, [guardianId]);
        
        // Add class name to each student
        const studentsWithClass = result.rows.map(s => ({
          ...s,
          class: s.class || className
        }));
        
        students.push(...studentsWithClass);
      } catch (err) {
        console.warn(`Error fetching students from ${className}:`, err.message);
      }
    }
    
    res.json(students);
  } catch (error) {
    console.error("Error fetching guardian students:", error);
    res.status(500).json({ error: "Failed to fetch students", details: error.message });
  }
});

module.exports = router;
