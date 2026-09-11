/**
 * Get the current branch code — sessionStorage ONLY (per-tab isolation).
 * Never falls back to localStorage to prevent cross-tab contamination.
 * Each browser tab keeps its own branch code independently.
 */
export function getBranchCode() {
  let code = sessionStorage.getItem('branchCode')
    || localStorage.getItem('rememberedBranchCode') || '';
  if (code.includes(',')) {
    code = code.split(',')[0].trim();
    sessionStorage.setItem('branchCode', code);
  }
  return code.toUpperCase();
}

/**
 * Set the branch code for this tab only (sessionStorage).
 * If remember=true, also saves to localStorage under a DIFFERENT key
 * (rememberedBranchCode) used ONLY to pre-fill the login form, never for API calls.
 */
export function setBranchCode(code, remember = false) {
  const value = (code || '').toUpperCase();
  sessionStorage.setItem('branchCode', value);
  if (remember) {
    localStorage.setItem('rememberedBranchCode', value);
  }
}
