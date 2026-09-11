SELECT id, name, "gradeLevel", "isActive", description FROM school_comms."FeeStructure";
SELECT count(*) as invoices FROM school_comms."Invoice";
SELECT table_name FROM information_schema.tables WHERE table_schema = 'classes_schema' ORDER BY table_name;
