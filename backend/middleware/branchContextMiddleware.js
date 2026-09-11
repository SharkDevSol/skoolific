const { branchContext } = require('../config/db');

function resolveBranchCode(req) {
  let branchCode = req.headers['x-branch-code'];
  if (Array.isArray(branchCode)) branchCode = branchCode[0];
  branchCode = branchCode || req.body?.branchCode || req.query?.branchCode;
  if (Array.isArray(branchCode)) branchCode = branchCode[0];
  if (branchCode && typeof branchCode === 'string') branchCode = branchCode.split(',')[0].trim();
  return branchCode || null;
}

function reenterBranchContext(req, res, next) {
  const branchCode = resolveBranchCode(req);
  if (branchCode) {
    branchContext.run(branchCode, () => next());
  } else {
    next();
  }
}

function branchSafeUpload(uploadMiddleware) {
  return [uploadMiddleware, reenterBranchContext];
}

module.exports = { reenterBranchContext, branchSafeUpload, resolveBranchCode };