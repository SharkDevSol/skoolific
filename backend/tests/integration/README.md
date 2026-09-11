# Integration Tests for Student Registration API

## Overview

This directory contains integration tests for the Skoolific V2 student registration API. The tests verify the complete registration flow including database operations, validation, and multi-branch support.

## Test Files

- `setup.js` - Test environment setup utilities and helper functions
- `studentRegistration.test.js` - Comprehensive integration tests for student registration

## Test Coverage

The student registration integration tests cover:

### 1. Successful Registration
- Register new student with valid data
- Register student with machine ID
- Verify automatic ID generation (school_id and class_id)

### 2. Validation Tests
- Required field validation (student_name, age, gender)
- Guardian information validation
- Class name validation
- Data type validation

### 3. Duplicate Prevention
- Prevent duplicate machine IDs within same class
- Prevent duplicate machine IDs across different classes
- Allow guardian reuse for multiple students (siblings)

### 4. Database Verification
- Verify all student data is correctly stored
- Verify unique school_id and class_id generation
- Verify global ID tracker updates
- Verify machine ID tracking

### 5. Error Handling
- Invalid class name handling
- Database connection error handling
- Detailed error messages

### 6. Multi-branch Support
- Registration across different classes (simulating branches)
- Global school_id counter across all classes
- Independent class_id counter per class
- Cross-class machine ID validation

## Database Setup

### Prerequisites

1. **PostgreSQL Database**: Ensure PostgreSQL is installed and running
2. **Test Database**: Create a test database (default: `skoolific_test`)
3. **Database Credentials**: Configure test database credentials

### Configuration

The tests use environment variables for database configuration. You can configure them in two ways:

#### Option 1: Use existing database credentials (Recommended for local testing)

The setup will automatically fall back to your main database credentials from `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=[REDACTED-PASSWORD]
DB_NAME=skoolific
```

#### Option 2: Create separate test database credentials

Create a `.env.test` file in the `backend` directory:

```env
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_USER=postgres
TEST_DB_PASSWORD=your_test_password
TEST_DB_NAME=skoolific_test
```

### Database Schema

The tests automatically create the required database schema:

- `school_schema_points` schema
  - `global_id_tracker` table - Tracks global school IDs
  - `global_machine_ids` table - Tracks machine IDs globally
  - `classes` table - Stores class configuration

- `classes_schema` schema
  - Dynamic class tables created per test

## Running the Tests

### Run all integration tests:
```bash
npm test -- tests/integration/
```

### Run only student registration tests:
```bash
npm test -- studentRegistration.test.js
```

### Run with coverage disabled (faster):
```bash
npm test -- studentRegistration.test.js --coverage=false
```

### Run in watch mode:
```bash
npm test -- studentRegistration.test.js --watch
```

## Test Environment Setup

The tests use the following setup:

1. **beforeAll**: 
   - Initialize database connection
   - Create test schemas and tables
   - Set up global ID tracker
   - Create test class table

2. **afterEach**:
   - Clean up test student data
   - Clean up test machine IDs

3. **afterAll**:
   - Drop test class tables
   - Close database connection

## API Endpoint Tested

**POST** `/api/students/add-student`

### Request Body:
```json
{
  "class": "Grade10A",
  "student_name": "John Doe",
  "age": 15,
  "gender": "Male",
  "guardian_name": "Jane Doe",
  "guardian_phone": "+251911234567",
  "guardian_relation": "Mother",
  "smachine_id": "MACHINE_001" // Optional
}
```

### Response:
```json
{
  "message": "Student added successfully",
  "student_username": "johndoe_1234",
  "student_password": "abc12345",
  "guardian_username": "janedoe_5678",
  "guardian_password": "xyz67890",
  "generated_ids": {
    "school_id": 1,
    "class_id": 1
  },
  "id_explanation": {
    "school_id": "Unique across all students in all classes",
    "class_id": "Unique within Grade10A class only"
  }
}
```

## Troubleshooting

### Database Connection Errors

If you see "password authentication failed" errors:

1. Check your database credentials in `.env`
2. Ensure PostgreSQL is running
3. Verify the database user has necessary permissions
4. Try connecting manually: `psql -U postgres -d skoolific_test`

### Test Database Not Found

If you see "database does not exist" errors:

1. Create the test database manually:
   ```sql
   CREATE DATABASE skoolific_test;
   ```

2. Or use the main database by setting:
   ```env
   TEST_DB_NAME=skoolific
   ```

### Schema/Table Errors

If you see schema or table errors:

1. The tests automatically create required schemas
2. Ensure the database user has CREATE privileges
3. Check if schemas already exist and have conflicting data

### API Server Not Running

The integration tests require the API server to be running:

1. Start the server: `npm start` or `npm run dev`
2. Verify server is running on port 5052 (or configured port)
3. Check `API_BASE_URL` in `setup.js` matches your server URL

## Test Data Cleanup

The tests use prefixes to identify test data:

- Student names: `Test%`
- School IDs: `TEST_%`
- Machine IDs: `TEST_%`

All test data is automatically cleaned up after each test run.

## Future Enhancements

Potential improvements for the test suite:

1. Add tests for file upload (student images)
2. Add tests for custom fields
3. Add tests for KG and evening class students
4. Add performance tests for bulk registration
5. Add tests for concurrent registration
6. Mock external dependencies for faster tests
7. Add API authentication tests

## Related Documentation

- [Phase 10.2 Tasks](.kiro/specs/skoolific-v2-upgrade/tasks.md)
- [Requirements Document](.kiro/specs/skoolific-v2-upgrade/requirements.md)
- [Design Document](.kiro/specs/skoolific-v2-upgrade/design.md)
- [Student Routes](../../routes/studentRoutes.js)

## Support

For issues or questions about the integration tests, please refer to:

- Task 10.2.2 in the spec document
- Backend API documentation
- Database schema documentation
