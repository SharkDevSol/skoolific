const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const multer = require("multer");
const { branchSafeUpload } = require('../middleware/branchContextMiddleware');
const path = require("path");
const fs = require("fs");
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

// Configure multer for file uploads - use diskStorage with timestamp names + extensions
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "Uploads/"),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "video/mp4", "application/pdf"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, MP4, and PDF are allowed."));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Ensure Uploads directory exists
const uploadDir = path.join(__dirname, "../Uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Helper function to check if a table exists and get its columns
const getTableColumns = async (tableName) => {
  try {
    const result = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'classes_schema' AND table_name = $1`,
      [tableName]
    );
    return result.rows.map(row => row.column_name);
  } catch (error) {
    console.error(`Error fetching columns for table ${tableName}:`, error);
    return [];
  }
};

// Get all class names, excluding school_student_count
router.get("/classes", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'classes_schema'
    `);
    const classes = result.rows.map(row => row.table_name);
    res.json(classes);
  } catch (error) {
    console.error("Error fetching classes:", error);
    res.status(500).json({ error: "Failed to fetch classes", details: error.message });
  }
});

// Check whether a student machine ID is already in use (globally, across all classes)
router.get("/check-machine-id/:smachineId", async (req, res) => {
  const smachineId = String(req.params.smachineId || '').trim();
  if (!smachineId) {
    return res.json({ exists: false });
  }
  try {
    // 1) global_machine_ids tracker (fastest / authoritative)
    const g = await pool.query(
      `SELECT student_name, class_name FROM school_schema_points.global_machine_ids WHERE smachine_id = $1 LIMIT 1`,
      [smachineId]
    );
    if (g.rows.length > 0) {
      return res.json({ exists: true, student_name: g.rows[0].student_name, class_name: g.rows[0].class_name });
    }

    // 2) Fallback: scan class tables
    const tables = (await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema'`
    )).rows.map(r => r.table_name);
    let smachineColExists = false;
    for (const t of tables) {
      const col = (await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema='classes_schema' AND table_name=$1 AND column_name='smachine_id'`,
        [t]
      )).rows.length > 0;
      if (!col) continue;
      smachineColExists = true;
      const r = await pool.query(
        `SELECT student_name FROM classes_schema."${t}" WHERE smachine_id::text = $1 LIMIT 1`,
        [smachineId]
      );
      if (r.rows.length > 0) {
        return res.json({ exists: true, student_name: r.rows[0].student_name, class_name: t });
      }
    }
    // no smachine_id column anywhere => can't be duplicate
    if (!smachineColExists) {
      return res.json({ exists: false });
    }
    return res.json({ exists: false });
  } catch (error) {
    console.error("Error checking machine id:", error.message);
    // Don't block registration on a check failure — return exists:false
    return res.json({ exists: false });
  }
});

// Get students for a specific class - returns ALL columns including password fields
router.get("/students/:className", async (req, res) => {
  const { className } = req.params;
  const { includeInactive, studentType } = req.query; // Add query parameters for filtering
  
  try {
    // Validate className to prevent SQL injection and ensure it's a valid table name
    const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
    if (!validTableName) {
      return res.status(400).json({ error: "Invalid class name provided." });
    }

    // Check which columns exist
    const columnCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'classes_schema' AND table_name = $1 
       AND column_name IN ('is_active', 'is_kg', 'is_evening_class', 'student_type')`,
      [className]
    );
    
    const existingColumns = columnCheck.rows.map(row => row.column_name);
    const hasIsActive = existingColumns.includes('is_active');
    const hasStudentType = existingColumns.includes('student_type');
    const hasIsKg = existingColumns.includes('is_kg');
    const hasIsEvening = existingColumns.includes('is_evening_class');
    
    // Build query with filters
    let whereConditions = [];
    
    // Handle is_active filter
    if (hasIsActive) {
      if (includeInactive === 'true') {
        // Include all students (no filter)
      } else if (includeInactive === 'only') {
        whereConditions.push('is_active = FALSE');
      } else {
        // Only active students (default)
        whereConditions.push('(is_active = TRUE OR is_active IS NULL)');
      }
    }
    
    // Handle student type filter (KG, evening, regular)
    if (studentType && hasStudentType) {
      // studentType can be: 'kg', 'evening', 'kg_evening', 'regular'
      whereConditions.push(`student_type = '${studentType}'`);
    } else if (studentType === 'kg' && hasIsKg && !hasStudentType) {
      // Fallback to is_kg column if student_type doesn't exist
      whereConditions.push('is_kg = TRUE');
    } else if (studentType === 'evening' && hasIsEvening && !hasStudentType) {
      // Fallback to is_evening_class column if student_type doesn't exist
      whereConditions.push('is_evening_class = TRUE');
    }
    
    // Build final query
    let query = `SELECT * FROM classes_schema."${className}"`;
    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    query += ' ORDER BY LOWER(student_name) ASC';
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error(`Error fetching students for class ${className}:`, error);
    res.status(500).json({ error: `Failed to fetch students for class ${className}`, details: error.message });
  }
});

// Get single student data by school_id and class_id
router.get("/student/:className/:schoolId/:classId", async (req, res) => {
  const { className, schoolId, classId } = req.params;
  try {
    const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
    if (!validTableName) {
      return res.status(400).json({ error: "Invalid class name provided." });
    }

    const result = await pool.query(
      `SELECT * FROM classes_schema."${className}" WHERE school_id = $1 AND class_id = $2 AND (is_active = TRUE OR is_active IS NULL)`,
      [schoolId, classId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error(`Error fetching student from class ${className}:`, error);
    res.status(500).json({ error: "Failed to fetch student", details: error.message });
  }
});

// Update student data with file upload support
router.put("/student/:className/:schoolId/:classId", ...branchSafeUpload(upload.single("image_student")), async (req, res) => {
  const { className, schoolId, classId } = req.params;
  
  console.log('=== UPDATE STUDENT REQUEST ===');
  console.log('Class:', className, 'School ID:', schoolId, 'Class ID:', classId);
  console.log('Body:', req.body);
  console.log('File:', req.file);
  
  // Handle both JSON string format and direct FormData format
  let updates = {};
  if (req.body.updates) {
    updates = JSON.parse(req.body.updates);
  } else {
    // Direct FormData - use all body fields except file
    updates = { ...req.body };
  }
  
  console.log('Parsed updates:', updates);
  
  const file = req.file;

  try {
    const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
    if (!validTableName) {
      return res.status(400).json({ error: "Invalid class name provided." });
    }

    // Prepare update fields
    const fields = { ...updates };
    if (file) {
      fields.image_student = `/Uploads/${file.filename}`;
    }

    // Remove school_id and class_id from updates to avoid modifying primary keys
    delete fields.school_id;
    delete fields.class_id;

    // Validate smachine_id uniqueness across ALL classes if being updated
    if (fields.smachine_id) {
      // Check global tracker table first (most reliable)
      try {
        const globalCheck = await pool.query(
          'SELECT student_name, class_name, school_id, class_id FROM school_schema_points.global_machine_ids WHERE smachine_id = $1',
          [fields.smachine_id]
        );
        
        // Check if machine ID exists and belongs to a different student
        if (globalCheck.rows.length > 0) {
          const existing = globalCheck.rows[0];
          // Allow if it's the same student being updated (convert to strings for comparison)
          if (String(existing.school_id) !== String(schoolId) || String(existing.class_id) !== String(classId)) {
            return res.status(400).json({ 
              error: `Machine ID ${fields.smachine_id} already added. This ID is used by student "${existing.student_name}" in ${existing.class_name}.`
            });
          }
        }
      } catch (err) {
        // Tracker table might not exist, fall back to checking all classes
      }
      
      // Fallback: Check all class tables
      const allClasses = (await pool.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = $1',
        ['classes_schema']
      )).rows.map(row => row.table_name);
      
      for (const cls of allClasses) {
        const existingMachineId = await pool.query(
          `SELECT student_name, class, school_id, class_id FROM classes_schema."${cls}" WHERE smachine_id = $1`,
          [fields.smachine_id]
        );
        
        // Check if machine ID exists and belongs to a different student
        if (existingMachineId.rows.length > 0) {
          const existing = existingMachineId.rows[0];
          // Allow if it's the same student being updated (convert to strings for comparison)
          if (String(existing.school_id) !== String(schoolId) || String(existing.class_id) !== String(classId)) {
            return res.status(400).json({ 
              error: `Machine ID ${fields.smachine_id} already added. This ID is used by student "${existing.student_name}" in ${existing.class}.`
            });
          }
        }
      }
    }

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({ error: "No fields provided to update" });
    }

    // === CLASS TRANSFER ===
    // If the student's class was changed, move the student to the new class table
    const requestedClass = (updates.class || '').toString().trim();
    if (requestedClass && requestedClass !== className) {
      // Validate target class table
      if (!/^[a-zA-Z0-9_]+$/.test(requestedClass)) {
        return res.status(400).json({ error: 'Invalid class name provided.' });
      }
      const tableExists = await pool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'classes_schema' AND table_name = $1)`,
        [requestedClass]
      );
      if (!tableExists.rows[0].exists) {
        return res.status(400).json({ error: `Class "${requestedClass}" does not exist` });
      }

      // Get the current student record
      const current = await pool.query(
        `SELECT * FROM classes_schema."${className}" WHERE school_id = $1 AND class_id = $2`,
        [schoolId, classId]
      );
      if (current.rows.length === 0) {
        return res.status(404).json({ error: 'Student not found' });
      }
      const studentRow = current.rows[0];

      // Merge current data with updates
      const merged = { ...studentRow, ...updates };
      delete merged.id;
      if (file) merged.image_student = `/Uploads/${file.filename}`;

      // Assign new class_id in the target class
      const newIdResult = await pool.query(
        `SELECT COALESCE(MAX(class_id), 0) + 1 AS new_id FROM classes_schema."${requestedClass}" WHERE school_id = $1`,
        [schoolId]
      );
      const newClassId = newIdResult.rows[0].new_id;
      merged.class = requestedClass;
      merged.class_id = newClassId;
      merged.school_id = schoolId;

      // Build INSERT
      const insertCols = Object.keys(merged);
      const insertValues = insertCols.map((key) => {
        const value = merged[key];
        if (value === null || value === undefined) return null;
        if (key === 'age') return parseInt(value, 10);
        return value.toString();
      });
      const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ');
      const quotedCols = insertCols.map(c => `"${c}"`).join(', ');

      await pool.query(
        `INSERT INTO classes_schema."${requestedClass}" (${quotedCols}) VALUES (${placeholders})`,
        insertValues
      );

      // Remove from the old class table
      await pool.query(
        `DELETE FROM classes_schema."${className}" WHERE school_id = $1 AND class_id = $2`,
        [schoolId, classId]
      );

      // Sync finance records: re-point invoices to the new student id / fee structure,
      // or generate invoices like a new registration (NO SMS is sent on transfer)
      try {
        const { getBranchPrisma } = require('../services/BranchPrismaService');
        const prisma = getBranchPrisma();

        const schoolIdPadded = String(schoolId).padStart(4, '0');
        const oldClassIdPadded = String(classId).padStart(12, '0');
        const newClassIdPadded = String(newClassId).padStart(12, '0');
        const oldUuid = `00000000-0000-0000-${schoolIdPadded}-${oldClassIdPadded}`;
        const newUuid = `00000000-0000-0000-${schoolIdPadded}-${newClassIdPadded}`;

        // Find the target class fee structure
        const newFeeStructure = await prisma.feeStructure.findFirst({
          where: { gradeLevel: requestedClass, isActive: true },
          include: { items: true }
        });

        if (newFeeStructure) {
          const newMonthlyAmount = newFeeStructure.items.length > 0 ? parseFloat(newFeeStructure.items[0].amount) : null;

          // Parse the target class registration fees from the fee structure description
          let newRegFee = 0;
          let oldRegFee = 0;
          try {
            let desc = newFeeStructure.description || '{}';
            desc = desc.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
            const monthsData = JSON.parse(desc);
            newRegFee = parseFloat(monthsData.newRegistrationFee) || 0;
            oldRegFee = parseFloat(monthsData.oldRegistrationFee) || 0;
          } catch (e) { /* no reg fees configured */ }

          // Fetch existing invoices for the old student id
          const existingInvoices = await prisma.invoice.findMany({
            where: { studentId: oldUuid },
            include: { items: true }
          });

          if (existingInvoices.length > 0 && newMonthlyAmount !== null) {
            // Re-point AND recalculate amounts at the new class's monthly fee AND registration fee
            // Fee type follows the student's old/new registration type
            const studentFeeType = (merged.old_or_new && String(merged.old_or_new).toLowerCase() === 'old') ? 'old' : 'new';
            const targetRegFee = (studentFeeType === 'old' && oldRegFee > 0) ? oldRegFee : newRegFee;

            for (const inv of existingInvoices) {
              const monthNumber = inv.metadata?.monthNumber || 0;
              const isFirstMonth = (inv.metadata?.monthIndex === 1) || (monthNumber === 1);
              const monthlyItem = (inv.items || []).find(it =>
                it.feeCategory === 'TUITION' && !(it.description || '').toLowerCase().includes('registration')
              );
              const regItem = (inv.items || []).find(it =>
                it.feeCategory === 'TUITION' && (it.description || '').toLowerCase().includes('registration')
              );

              // Registration fee: align with the target class's fee for the student's type (only for the first month)
              let regFee = parseFloat(inv.metadata?.registrationFee || 0);
              const regItemChanged = isFirstMonth && regItem && targetRegFee > 0 && regFee !== targetRegFee;
              if (regItemChanged) regFee = targetRegFee;

              const discount = parseFloat(inv.discountAmount || 0);
              const lateFee = parseFloat(inv.lateFeeAmount || 0);
              const paid = parseFloat(inv.paidAmount || 0);
              const newTotal = newMonthlyAmount + (isFirstMonth ? regFee : 0);
              const newNet = newTotal - discount + lateFee;

              let newStatus = inv.status;
              if (paid >= newNet) newStatus = 'PAID';
              else if (paid > 0 && inv.status === 'PAID') newStatus = 'PARTIALLY_PAID';

              const itemUpdates = [];
              if (monthlyItem) {
                itemUpdates.push({ where: { id: monthlyItem.id }, data: { amount: newMonthlyAmount } });
              }
              if (regItemChanged) {
                itemUpdates.push({ where: { id: regItem.id }, data: { amount: targetRegFee } });
              }

              await prisma.invoice.update({
                where: { id: inv.id },
                data: {
                  studentId: newUuid,
                  feeStructureId: newFeeStructure.id,
                  totalAmount: newTotal,
                  netAmount: newNet,
                  status: newStatus,
                  ...(regItemChanged ? {
                    metadata: {
                      ...(inv.metadata || {}),
                      registrationFee: targetRegFee,
                      newRegistrationFee: newRegFee || 0,
                      oldRegistrationFee: oldRegFee || 0,
                      studentType: studentFeeType
                    }
                  } : {}),
                  ...(itemUpdates.length > 0 ? { items: { update: itemUpdates } } : {})
                }
              });
            }
            console.log(`💳 Transfer invoice sync: re-pointed + recalculated ${existingInvoices.length} invoice(s) at ${newMonthlyAmount} Birr/month${targetRegFee ? `, reg fee ${targetRegFee} (${studentFeeType})` : ''}`);
          } else if (existingInvoices.length === 0) {
            // No invoices at all — generate like a new registration (no SMS)
            const { generateStudentInvoices } = require('../services/studentInvoiceService');
            const studentFeeType = (merged.old_or_new && String(merged.old_or_new).toLowerCase() === 'old') ? 'old' : 'new';
            const result = await generateStudentInvoices({ studentUuid: newUuid, className: requestedClass, skipRegistrationFee: true, regFeeType: studentFeeType });
            console.log(`💳 Transfer invoice sync: generated ${result.generated} new invoice(s) for ${requestedClass}`);
          } else {
            // New fee structure has no items — just re-point without amount changes
            await prisma.invoice.updateMany({
              where: { studentId: oldUuid },
              data: { studentId: newUuid, feeStructureId: newFeeStructure.id }
            });
            console.log(`💳 Transfer invoice sync: re-pointed ${existingInvoices.length} invoice(s) (no monthly amount on new fee structure)`);
          }
        } else {
          console.log(`⚠️ Transfer invoice sync: no active fee structure for class "${requestedClass}" — skipped`);
        }
      } catch (err) {
        console.log('Note: Transfer invoice sync skipped:', err.message);
      }

      // Update global machine ID tracker
      if (merged.smachine_id) {
        try {
          await pool.query(`
            UPDATE school_schema_points.global_machine_ids 
            SET class_name = $1, class_id = $2, student_name = $3, updated_at = CURRENT_TIMESTAMP
            WHERE school_id = $4 AND smachine_id = $5
          `, [requestedClass, newClassId, merged.student_name, schoolId, merged.smachine_id]);
        } catch (err) {
          console.log('Note: Global machine ID tracker not available:', err.message);
        }
      }

      // Delete old image file if replaced
      if (file && updates.image_student && updates.image_student !== file.filename) {
        const oldFilePath = path.join(uploadDir, updates.image_student);
        if (fs.existsSync(oldFilePath)) fs.unlinkSync(oldFilePath);
      }

      console.log(`✅ Student ${merged.student_name} transferred from ${className} to ${requestedClass} (new class_id: ${newClassId})`);
      return res.json({ ...merged, transferred: true, fromClass: className, toClass: requestedClass });
    }

    // Build query
    const columns = Object.keys(fields)
      .map((key, index) => `"${key}" = $${index + 1}`)
      .join(", ");
    const values = Object.entries(fields).map(([key, value]) => {
      if (value === "null" || value === null) return null;
      if (key === "age") return parseInt(value, 10);
      if (key.includes("date")) return value; // Handle date fields
      return value.toString();
    });

    const result = await pool.query(
      `UPDATE classes_schema."${className}" SET ${columns} WHERE school_id = $${Object.keys(fields).length + 1} AND class_id = $${Object.keys(fields).length + 2} RETURNING *`,
      [...values, schoolId, classId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Update global machine ID tracker if smachine_id was changed
    if (fields.smachine_id) {
      try {
        // First, delete any old machine ID entries for this student
        await pool.query(`
          DELETE FROM school_schema_points.global_machine_ids 
          WHERE school_id = $1 AND class_id = $2
        `, [schoolId, classId]);
        
        // Then insert the new machine ID
        await pool.query(`
          INSERT INTO school_schema_points.global_machine_ids 
          (smachine_id, student_name, class_name, school_id, class_id)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (smachine_id) DO UPDATE 
          SET student_name = EXCLUDED.student_name,
              class_name = EXCLUDED.class_name,
              school_id = EXCLUDED.school_id,
              class_id = EXCLUDED.class_id,
              updated_at = CURRENT_TIMESTAMP
        `, [
          fields.smachine_id, 
          result.rows[0].student_name, 
          className, 
          schoolId, 
          classId
        ]);
      } catch (err) {
        // Tracker table might not exist yet, that's okay
        console.log('Note: Global machine ID tracker not available:', err.message);
      }
    }

    // Delete old file if a new one was uploaded
    if (file && updates.image_student && updates.image_student !== file.filename) {
      const oldFilePath = path.join(uploadDir, updates.image_student);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error(`Error updating student in class ${className}:`, error);
    res.status(500).json({ error: "Failed to update student", details: error.message });
  }
});

// Delete student
router.delete("/student/:className/:schoolId/:classId", async (req, res) => {
  const { className, schoolId, classId } = req.params;
  try {
    const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
    if (!validTableName) {
      return res.status(400).json({ error: "Invalid class name provided." });
    }

    const result = await pool.query(
      `DELETE FROM classes_schema."${className}" WHERE school_id = $1 AND class_id = $2 RETURNING *`,
      [schoolId, classId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Student not found" });
    }
    // Delete associated image file if it exists
    if (result.rows[0].image_student) {
      const filePath = path.join(__dirname, "../Uploads", result.rows[0].image_student);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    res.json({ message: "Student deleted successfully" });
  } catch (error) {
    console.error(`Error deleting student from class ${className}:`, error);
    res.status(500).json({ error: "Failed to delete student", details: error.message });
  }
});

// DEACTIVATE/ACTIVATE STUDENT (HIDE FROM ALL SYSTEM LISTS)
router.put('/toggle-active/:className/:schoolId/:classId', async (req, res) => {
  const { className, schoolId, classId } = req.params;
  const { is_active } = req.body;
  
  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active must be a boolean value' });
  }
  
  // Validate className
  const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
  if (!validTableName) {
    return res.status(400).json({ error: 'Invalid class name provided' });
  }
  
  try {
    // Check if is_active column exists, if not add it
    const columnCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'classes_schema' AND table_name = $1 AND column_name = 'is_active'`,
      [className]
    );
    
    if (columnCheck.rowCount === 0) {
      // Add is_active column with default TRUE
      await pool.query(
        `ALTER TABLE classes_schema."${className}" 
         ADD COLUMN is_active BOOLEAN DEFAULT TRUE`
      );
      console.log(`Added is_active column to classes_schema.${className}`);
    }
    
    // Update the student
    const updateResult = await pool.query(
      `UPDATE classes_schema."${className}" 
       SET is_active = $1 
       WHERE school_id = $2 AND class_id = $3 
       RETURNING *`,
      [is_active, schoolId, classId]
    );
    
    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json({
      success: true,
      message: is_active 
        ? 'Student activated successfully - now visible in all system lists' 
        : 'Student deactivated successfully - now hidden from all system lists but data preserved',
      data: updateResult.rows[0]
    });
    
  } catch (error) {
    console.error('Error toggling student active status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// TOGGLE FREE STUDENT (MARK AS LEARNING FOR FREE / SCHOLARSHIP)
router.put('/toggle-free/:className/:schoolId/:classId', async (req, res) => {
  const { className, schoolId, classId } = req.params;
  const { is_free, exemption_type, exemption_reason, registration_fee_type } = req.body;
  
  if (typeof is_free !== 'boolean') {
    return res.status(400).json({ error: 'is_free must be a boolean value' });
  }
  
  // Validate className
  const validTableName = /^[a-zA-Z0-9_]+$/.test(className);
  if (!validTableName) {
    return res.status(400).json({ error: 'Invalid class name provided' });
  }
  
  // If marking as free, require exemption type AND a registration fee type.
  // Free students still pay a one-time Registration Fee (Old or New) — the
  // registration_fee_type tells the invoice generator which fee to charge.
  if (is_free && !exemption_type) {
    return res.status(400).json({ error: 'exemption_type is required when marking student as free' });
  }
  const regFeeType = registration_fee_type === 'old' ? 'old' : registration_fee_type === 'new' ? 'new' : 'new';
  if (is_free && registration_fee_type !== 'old' && registration_fee_type !== 'new') {
    // default to 'new' if not explicitly provided (backward compatible)
  }
  
  try {
    // Check if columns exist, if not add them
    const columnCheck = await pool.query(
      `SELECT column_name FROM information_schema.columns 
       WHERE table_schema = 'classes_schema' AND table_name = $1 
       AND column_name IN ('is_free', 'exemption_type', 'exemption_reason', 'registration_fee_type')`,
      [className]
    );
    
    const existingColumns = columnCheck.rows.map(row => row.column_name);
    
    if (!existingColumns.includes('is_free')) {
      await pool.query(
        `ALTER TABLE classes_schema."${className}" 
         ADD COLUMN is_free BOOLEAN DEFAULT FALSE`
      );
      console.log(`Added is_free column to classes_schema.${className}`);
    }
    
    if (!existingColumns.includes('exemption_type')) {
      await pool.query(
        `ALTER TABLE classes_schema."${className}" 
         ADD COLUMN exemption_type VARCHAR(50) DEFAULT NULL`
      );
      console.log(`Added exemption_type column to classes_schema.${className}`);
    }
    
    if (!existingColumns.includes('exemption_reason')) {
      await pool.query(
        `ALTER TABLE classes_schema."${className}" 
         ADD COLUMN exemption_reason TEXT DEFAULT NULL`
      );
      console.log(`Added exemption_reason column to classes_schema.${className}`);
    }

    if (!existingColumns.includes('registration_fee_type')) {
      await pool.query(
        `ALTER TABLE classes_schema."${className}" 
         ADD COLUMN registration_fee_type VARCHAR(10) DEFAULT NULL`
      );
      console.log(`Added registration_fee_type column to classes_schema.${className}`);
    }
    
    // Update the student
    const updateResult = await pool.query(
      `UPDATE classes_schema."${className}" 
       SET is_free = $1, exemption_type = $2, exemption_reason = $3, registration_fee_type = $4
       WHERE school_id = $5 AND class_id = $6 
       RETURNING *`,
      [is_free, is_free ? exemption_type : null, is_free ? exemption_reason : null, is_free ? regFeeType : null, schoolId, classId]
    );
    
    if (updateResult.rowCount === 0) {
      return res.status(404).json({ error: 'Student not found' });
    }
    
    res.json({
      success: true,
      message: is_free 
        ? `Student marked as learning for free (${exemption_type})` 
        : 'Student marked as paying student',
      data: updateResult.rows[0]
    });
    
  } catch (error) {
    console.error('Error toggling student free status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;