const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getEndpointPath, API_ENDPOINTS } = require('../config/api.config');

/**
 * GET /api/settings/branding
 * Get school branding information (logo, name, etc.)
 */
router.get('/branding', async (req, res) => {
  try {
    // Check if branding logo exists
    const brandingDir = path.join(__dirname, '../uploads/branding');
    let logoPath = null;

    if (fs.existsSync(brandingDir)) {
      const files = fs.readdirSync(brandingDir);
      const logoFile = files.find(file => file.startsWith('logo'));
      if (logoFile) {
        logoPath = `/uploads/branding/${logoFile}`;
      }
    }

    // Return default school info
    res.json({
      logo: logoPath,
      schoolName: 'School Name (Somali)',
      schoolNameAmharic: 'ኢቅራ ሮጸ አሕፃናት አንደኛና ሁለተኛ ደረጃ ት/ቤት',
      schoolNameEnglish: 'Iqra Kindergarten, Primary, Intermediate and Secondary School',
      schoolNameArabic: 'اقرأ روضة الأطفال ومدرسة الإبتدائية والمتوسطة والثانويه',
      contact: '0911775841',
      location: 'Jigiga-Ethiopia'
    });
  } catch (error) {
    console.error('Error fetching branding:', error);
    res.status(500).json({
      error: 'SYSTEM_ERROR',
      message: 'Failed to fetch branding information'
    });
  }
});

module.exports = router;
