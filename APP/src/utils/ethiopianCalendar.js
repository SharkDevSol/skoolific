/**
 * Ethiopian Calendar Utility
 * Converts between Gregorian and Ethiopian calendar systems
 * Based on the Ethiopian calendar (መስከረም ፩ = September 11/12)
 */

// Ethiopian month names in Amharic
const ETHIOPIAN_MONTHS = [
  'መስከረም', 'ጥቅምት', 'ህዳር', 'ታህሳስ', 'ጥር', 'የካቲት',
  'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሃሴ', 'ጳጉሜ'
];

const ETHIOPIAN_MONTHS_EN = [
  'Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit',
  'Megabit', 'Miazia', 'Genbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'
];

const DAY_NAMES_AMHARIC = ['ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'አርብ', 'ቅዳሜ', 'እሁድ'];
const DAY_NAMES_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Convert Gregorian date to Ethiopian date
 * @param {Date} gregDate - JavaScript Date object
 * @returns {{ year: number, month: number, day: number, monthName: string, monthNameEn: string, dayName: string, dayNameEn: string }}
 */
export function gregorianToEthiopian(gregDate) {
  const year = gregDate.getFullYear();
  const month = gregDate.getMonth() + 1;
  const day = gregDate.getDate();

  // Ethiopian New Year is Sep 11 (or Sep 12 in Gregorian leap years)
  const isGregorianLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);
  const newYearDay = isGregorianLeapYear(year) ? 12 : 11;

  // On or after Ethiopian New Year in this Gregorian year → current Ethiopian year
  // Before Ethiopian New Year → previous Ethiopian year
  const afterNewYear = month > 9 || (month === 9 && day >= newYearDay);
  const ethYear = afterNewYear ? year - 7 : year - 8;

  let ethMonth = 0;
  let ethDay = 0;

  // Calculate days from Ethiopian New Year
  const startOfYear = new Date(year, 8, newYearDay); // September
  const diffDays = Math.floor((gregDate - startOfYear) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    // Date is before Ethiopian New Year — belongs to previous Ethiopian year
    const prevNewYearDay = isGregorianLeapYear(year - 1) ? 12 : 11;
    const prevStartOfYear = new Date(year - 1, 8, prevNewYearDay);
    const prevDiffDays = Math.floor((gregDate - prevStartOfYear) / (1000 * 60 * 60 * 24));
    
    const monthDays = getEthiopianMonthDays(ethYear);
    let remaining = prevDiffDays;
    for (let i = 0; i < monthDays.length; i++) {
      if (remaining < monthDays[i]) {
        ethMonth = i + 1;
        ethDay = remaining + 1;
        break;
      }
      remaining -= monthDays[i];
    }
  } else {
    let remaining = diffDays;
    const monthDays = getEthiopianMonthDays(ethYear);
    for (let i = 0; i < monthDays.length; i++) {
      if (remaining < monthDays[i]) {
        ethMonth = i + 1;
        ethDay = remaining + 1;
        break;
      }
      remaining -= monthDays[i];
    }
  }

  const dayOfWeek = gregDate.getDay();
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0

  return {
    year: ethYear,
    month: ethMonth,
    day: ethDay,
    monthName: ETHIOPIAN_MONTHS[ethMonth - 1] || '',
    monthNameEn: ETHIOPIAN_MONTHS_EN[ethMonth - 1] || '',
    dayName: DAY_NAMES_AMHARIC[dayIndex] || '',
    dayNameEn: DAY_NAMES_EN[dayIndex] || ''
  };
}

/**
 * Get Ethiopian month days (13 months, last month = Pagume with 5 or 6 days)
 */
function getEthiopianMonthDays(year) {
  const isLeap = year % 4 === 3;
  return [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, isLeap ? 6 : 5];
}

/**
 * Get current Ethiopian date
 * @returns {object} Ethiopian date object
 */
export function getEthiopianDate() {
  return gregorianToEthiopian(new Date());
}

/**
 * Convert Ethiopian date to Gregorian date
 * @param {number} ethYear - Ethiopian year
 * @param {number} ethMonth - Ethiopian month (1-13)
 * @param {number} ethDay - Ethiopian day
 * @returns {Date} JavaScript Date object
 */
export function ethiopianToGregorian(ethYear, ethMonth, ethDay) {
  // Ethiopian New Year in Gregorian: Sep 11 (or Sep 12 in leap years)
  // Ethiopian year 2018 started Sep 11, 2025 → gregYear = ethYear + 7
  const gregYear = ethYear + 7;
  const isLeap = gregYear % 4 === 3;
  const newYearDay = isLeap ? 12 : 11;
  
  let totalDays = 0;
  const monthDays = getEthiopianMonthDays(ethYear);
  for (let i = 0; i < ethMonth - 1; i++) {
    totalDays += monthDays[i];
  }
  totalDays += ethDay - 1;
  
  const startDate = new Date(gregYear, 8, newYearDay); // September
  return new Date(startDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
}

/**
 * Get current Ethiopian year
 * @returns {number} Ethiopian year
 */
export function getCurrentEthiopianYear() {
  return gregorianToEthiopian(new Date()).year;
}

/**
 * Get current Ethiopian month
 * @returns {{ month: number, name: string, nameEn: string }} Ethiopian month
 */
export function getCurrentEthiopianMonth() {
  const eth = gregorianToEthiopian(new Date());
  return { month: eth.month, name: eth.monthName, nameEn: eth.monthNameEn };
}

/**
 * Get Ethiopian month name
 * @param {number} monthNumber - Ethiopian month number (1-13)
 * @returns {string} Ethiopian month name in English
 */
export function getEthiopianMonthName(monthNumber) {
  return ETHIOPIAN_MONTHS_EN[monthNumber - 1] || 'Unknown';
}

/**
 * Get current Ethiopian month range (start and end dates)
 * @returns {{ start: Date, end: Date, month: number, year: number }}
 */
export function getCurrentEthiopianMonthRange() {
  const now = new Date();
  const eth = gregorianToEthiopian(now);
  const startOfMonth = ethiopianToGregorian(eth.year, eth.month, 1);
  const monthDays = getEthiopianMonthDays(eth.year);
  const endOfMonth = ethiopianToGregorian(eth.year, eth.month, monthDays[eth.month - 1]);
  return {
    start: startOfMonth,
    end: endOfMonth,
    month: eth.month,
    year: eth.year
  };
}

/**
 * Format Ethiopian date
 * @param {Date} date - JavaScript Date object
 * @param {string} format - 'full' | 'short' | 'day' (default: 'full')
 * @returns {string} Formatted date string
 */
export function formatEthiopianDate(date, format = 'full') {
  const eth = gregorianToEthiopian(date || new Date());
  
  switch (format) {
    case 'short':
      return `${eth.day}/${eth.monthNameEn}/${eth.year}`;
    case 'day':
      return `${eth.dayNameEn}, ${eth.monthNameEn} ${eth.day}, ${eth.year}`;
    case 'amharic':
      return `${eth.dayName} ${eth.monthName} ${eth.day}፣ ${eth.year}`;
    case 'full':
    default:
      return `${eth.monthNameEn} ${eth.day}, ${eth.year}`;
  }
}

/**
 * Get Ethiopian school year range (e.g., "2017/18" or "2018")
 * @param {Date} date - Optional date (defaults to now)
 * @returns {string} School year string
 */
export function getEthiopianSchoolYear(date = new Date()) {
  const eth = gregorianToEthiopian(date);
  const next = eth.year + 1;
  return `${eth.year}/${next.toString().slice(-2)}`;
}

/**
 * Get Gregorian date from Ethiopian date context
 * Used by components that display Ethiopian dates
 * @param {Date} date - Optional JavaScript Date
 * @returns {object} { gregDate, ethDate }
 */
export function getDateContext(date = new Date()) {
  const gregDate = date;
  const ethDate = gregorianToEthiopian(gregDate);
  return { gregDate, ethDate };
}

export default {
  gregorianToEthiopian,
  ethiopianToGregorian,
  getEthiopianDate,
  getCurrentEthiopianYear,
  formatEthiopianDate,
  getEthiopianSchoolYear,
  getDateContext
};
