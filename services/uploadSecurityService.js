const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { resolveSafeRedirectUrl } = require("../utilities/securityHelpers.js");

const FORMAT_RULES = {
  png: {
    exts: [".png"],
    mimes: ["image/png"],
  },
  jpg: {
    exts: [".jpg", ".jpeg"],
    mimes: ["image/jpeg", "image/pjpeg"],
  },
  webp: {
    exts: [".webp"],
    mimes: ["image/webp"],
  },
  gif: {
    exts: [".gif"],
    mimes: ["image/gif"],
  },
  ico: {
    exts: [".ico"],
    mimes: ["image/x-icon", "image/vnd.microsoft.icon", "image/ico"],
  },
};

const UPLOAD_PROFILES = {
  ISSUE_PHOTO: ["png", "jpg", "webp", "gif"],
  MACHINE_PICTURE: ["png", "jpg", "webp", "gif"],
  BRANDING_LOGO: ["png", "jpg", "webp"],
  BRANDING_FAVICON: ["ico", "png"],
};

const SAFE_STATIC_RASTER_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"]);

/**
 * Detects an image format from the leading bytes of a Buffer (magic bytes).
 * Never trusts filename extensions or HTTP Content-Type headers.
 * @param {Buffer} buffer
 * @returns {"png" | "jpg" | "webp" | "gif" | "ico" | null}
 */
function detectImageFormatFromBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }

  // GIF: "GIF87a" or "GIF89a"
  if (buffer.length >= 6) {
    const header = buffer.toString("ascii", 0, 6);
    if (header === "GIF87a" || header === "GIF89a") {
      return "gif";
    }
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }

  // ICO: 00 00 01 00
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  ) {
    return "ico";
  }

  return null;
}

/**
 * Reads the header of an uploaded file and identifies its true image format.
 * @param {string} filePath
 * @returns {"png" | "jpg" | "webp" | "gif" | "ico" | null}
 */
function detectImageFormatFromFile(filePath) {
  if (!filePath || typeof filePath !== "string") return null;
  let fd;
  try {
    fd = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(32);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return detectImageFormatFromBuffer(buffer.subarray(0, bytesRead));
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close failures
      }
    }
  }
}

/**
 * Checks whether both extension AND declared MIME type match the same allowed format.
 * @param {{ originalname?: string, mimetype?: string }} file
 * @param {string[]} allowedFormats
 * @returns {boolean}
 */
function matchesExtensionAndMime(file, allowedFormats) {
  if (!file || typeof file.originalname !== "string" || typeof file.mimetype !== "string") {
    return false;
  }
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.split(";")[0].trim().toLowerCase();

  return allowedFormats.some((fmt) => {
    const rule = FORMAT_RULES[fmt];
    return Boolean(rule && rule.exts.includes(ext) && rule.mimes.includes(mime));
  });
}

/**
 * Builds a Multer fileFilter enforcing strict AND validation on extension + MIME.
 * @param {string[]} allowedFormats
 * @param {string} [errorMessage]
 * @returns {Function}
 */
function createImageFileFilter(allowedFormats, errorMessage) {
  const fallbackMsg = "Format de fichier non pris en charge. Veuillez fournir une image valide.";
  return (req, file, cb) => {
    if (matchesExtensionAndMime(file, allowedFormats)) {
      return cb(null, true);
    }
    const err = new Error(errorMessage || fallbackMsg);
    err.code = "INVALID_FILE_TYPE";
    return cb(err);
  };
}

/**
 * Creates a neutral temporary filename without trusting client-supplied extensions.
 * @param {string} [prefix="upload-"]
 * @returns {string}
 */
function createTempFilename(prefix = "upload-") {
  return `${prefix}${Date.now()}-${crypto.randomBytes(6).toString("hex")}.upload`;
}

/**
 * Removes a file path silently if it exists.
 * @param {string} filePath
 * @returns {boolean}
 */
function safeUnlinkPath(filePath) {
  if (!filePath || typeof filePath !== "string") return false;
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isDirectory()) return false;
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes all temporary files attached to req.file or req.files by Multer.
 * @param {import("express").Request} req
 */
function cleanupRequestFiles(req) {
  if (!req) return;
  if (req.file && req.file.path) {
    safeUnlinkPath(req.file.path);
  }
  if (Array.isArray(req.files)) {
    req.files.forEach((f) => f && f.path && safeUnlinkPath(f.path));
  } else if (req.files && typeof req.files === "object") {
    Object.values(req.files).forEach((group) => {
      if (Array.isArray(group)) {
        group.forEach((f) => f && f.path && safeUnlinkPath(f.path));
      }
    });
  }
}

/**
 * Verifies magic bytes of an uploaded file and renames it with the detected extension.
 * Deletes the uploaded file immediately if verification fails.
 * @param {Express.Multer.File} file
 * @param {{ allowedFormats: string[], targetDir?: string, prefix?: string }} options
 * @returns {{ format: string, filename: string, filePath: string } | null}
 */
function verifyAndFinalizeUploadedFile(file, { allowedFormats, targetDir, prefix = "" }) {
  if (!file || !file.path) return null;

  const detectedFormat = detectImageFormatFromFile(file.path);
  if (!detectedFormat || !Array.isArray(allowedFormats) || !allowedFormats.includes(detectedFormat)) {
    safeUnlinkPath(file.path);
    const err = new Error("Contenu de fichier invalide : le fichier ne correspond pas à une image autorisée.");
    err.code = "INVALID_FILE_CONTENT";
    throw err;
  }

  const destDir = targetDir || path.dirname(file.path);
  const finalName = `${prefix}${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${detectedFormat}`;
  const finalPath = path.join(destDir, finalName);

  try {
    fs.renameSync(file.path, finalPath);
  } catch (err) {
    safeUnlinkPath(file.path);
    throw err;
  }

  file.filename = finalName;
  file.path = finalPath;

  return { format: detectedFormat, filename: finalName, filePath: finalPath };
}

/**
 * Safely deletes a stored file only if it stays strictly confined within baseDir.
 * Refuses path traversal, backslashes, null bytes, symlinks, and external URLs.
 * @param {string} baseDir
 * @param {string} storedPath
 * @param {{ expectedPrefix?: string }} [options]
 * @returns {boolean}
 */
function safeUnlinkInDir(baseDir, storedPath, { expectedPrefix = "/uploads/" } = {}) {
  if (!baseDir || !storedPath || typeof storedPath !== "string") {
    return false;
  }
  if (storedPath.includes("\0") || storedPath.includes("\\")) {
    return false;
  }
  if (!storedPath.startsWith(expectedPrefix)) {
    return false;
  }

  const relativePart = storedPath.slice(expectedPrefix.length);
  if (!relativePart || relativePart.startsWith("/")) {
    return false;
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, relativePart);

  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    return false;
  }

  try {
    const stat = fs.lstatSync(resolvedTarget);
    if (stat.isSymbolicLink() || stat.isDirectory() || !stat.isFile()) {
      return false;
    }
    fs.unlinkSync(resolvedTarget);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates an optional manual picture field on machine forms.
 * Allows safe /uploads/<raster> relative paths or http(s) URLs.
 * @param {unknown} rawPicture
 * @returns {string | null}
 */
function validatePictureField(rawPicture) {
  if (typeof rawPicture !== "string") return null;
  const trimmed = rawPicture.trim();
  if (!trimmed || trimmed.includes("\0") || trimmed.includes("\\")) {
    return null;
  }

  if (trimmed.startsWith("/uploads/")) {
    if (trimmed.includes("..")) return null;
    const ext = path.extname(trimmed).toLowerCase();
    return [".png", ".jpg", ".jpeg", ".webp", ".gif"].includes(ext) ? trimmed : null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Wraps a Multer middleware to convert upload errors cleanly (flash redirect or JSON 400).
 * @param {Function} multerMiddleware
 * @param {{ onErrorRedirect?: string | Function }} [options]
 * @returns {Function}
 */
function wrapUploadMiddleware(multerMiddleware, options = {}) {
  return (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (!err) return next();

      cleanupRequestFiles(req);

      let message = err.message || "Erreur lors du téléversement du fichier.";
      if (err.code === "LIMIT_FILE_SIZE") {
        message = "Le fichier dépasse la taille maximale autorisée.";
      } else if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
        message = "Nombre ou champ de fichier téléversé non autorisé.";
      }

      const isApi = Boolean(
        (req.baseUrl && req.baseUrl.startsWith("/api")) ||
          (req.originalUrl && req.originalUrl.startsWith("/api")) ||
          req.xhr ||
          (req.headers.accept && req.headers.accept.includes("application/json")),
      );

      if (isApi) {
        return res.status(400).json({ success: false, error: message });
      }

      if (req.session) {
        req.session.notification = `Error: ${message}`;
      }

      const rawTarget =
        typeof options.onErrorRedirect === "function" ? options.onErrorRedirect(req) : options.onErrorRedirect;
      const redirectTarget = resolveSafeRedirectUrl(rawTarget, req, "/fabtrack");

      return res.redirect(redirectTarget);
    });
  };
}

/**
 * Sets defensive security headers for files served from /uploads.
 * Forces download for any non-raster file as defense-in-depth against stored XSS.
 * @param {import("express").Response} res
 * @param {string} filePath
 */
function applyUploadStaticHeaders(res, filePath) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");

  const ext = typeof filePath === "string" ? path.extname(filePath).toLowerCase() : "";
  if (!SAFE_STATIC_RASTER_EXTS.has(ext)) {
    res.setHeader("Content-Disposition", "attachment");
  }
}

module.exports = {
  FORMAT_RULES,
  UPLOAD_PROFILES,
  SAFE_STATIC_RASTER_EXTS,
  detectImageFormatFromBuffer,
  detectImageFormatFromFile,
  matchesExtensionAndMime,
  createImageFileFilter,
  createTempFilename,
  safeUnlinkPath,
  cleanupRequestFiles,
  verifyAndFinalizeUploadedFile,
  safeUnlinkInDir,
  validatePictureField,
  wrapUploadMiddleware,
  applyUploadStaticHeaders,
};
