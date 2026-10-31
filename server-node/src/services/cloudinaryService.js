import { v2 as cloudinary } from 'cloudinary';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

/**
 * Inspect file header bytes (magic numbers) to verify genuine image content.
 * Prevents MIME-type spoofing (e.g. uploading .exe or .html disguised as .jpg).
 */
export function detectImageSignature(buffer) {
  if (!buffer || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }

  // GIF: 47 49 46 38 ("GIF8")
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return 'image/gif';
  }

  // WebP: 52 49 46 46 ("RIFF") ... 57 45 42 50 ("WEBP")
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Validate image buffer size, MIME type, and file signature.
 */
export function validateImageFile(buffer, claimedMimeType) {
  if (!buffer || buffer.length === 0) {
    throw ApiError.badRequest('No image file provided');
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  if (buffer.length > MAX_FILE_SIZE) {
    throw ApiError.badRequest('File size exceeds the 5MB limit');
  }

  const normalizedClaimed = (claimedMimeType || '').toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedClaimed)) {
    throw ApiError.badRequest(
      `Unsupported image type: ${claimedMimeType}. Allowed formats are JPEG, PNG, WebP, and GIF.`
    );
  }

  const detectedType = detectImageSignature(buffer);
  if (!detectedType) {
    throw ApiError.badRequest(
      'Corrupted image or invalid file signature. The uploaded file does not match a valid image format.'
    );
  }

  // Ensure claimed type is consistent with detected magic bytes
  if (
    (normalizedClaimed === 'image/jpeg' || normalizedClaimed === 'image/jpg') &&
    detectedType !== 'image/jpeg'
  ) {
    throw ApiError.badRequest('File content does not match JPEG signature');
  }
  if (normalizedClaimed === 'image/png' && detectedType !== 'image/png') {
    throw ApiError.badRequest('File content does not match PNG signature');
  }
  if (normalizedClaimed === 'image/webp' && detectedType !== 'image/webp') {
    throw ApiError.badRequest('File content does not match WebP signature');
  }
  if (normalizedClaimed === 'image/gif' && detectedType !== 'image/gif') {
    throw ApiError.badRequest('File content does not match GIF signature');
  }

  return detectedType;
}

export class CloudinaryService {
  static #client = cloudinary;
  static #forceMock = false;
  static #forceConfigured = false;

  static init() {
    if (
      env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET
    ) {
      this.#client.config({
        cloud_name: env.CLOUDINARY_CLOUD_NAME,
        api_key: env.CLOUDINARY_API_KEY,
        api_secret: env.CLOUDINARY_API_SECRET,
        secure: true,
      });
      console.log(
        `[cloudinary] Configured with cloud_name: ${env.CLOUDINARY_CLOUD_NAME}`
      );
    } else {
      console.log(
        '[cloudinary] Credentials not provided. Operating in development fallback/mock mode.'
      );
    }
  }

  static isConfigured() {
    if (this.#forceMock) return false;
    if (this.#forceConfigured) return true;
    return Boolean(
      env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET
    );
  }

  /**
   * Helper for tests to force mock mode or mock client responses.
   */
  static setForceMock(mock) {
    this.#forceMock = Boolean(mock);
  }

  /**
   * Helper for tests to force configured mode.
   */
  static setForceConfigured(configured) {
    this.#forceConfigured = Boolean(configured);
  }

  /**
   * Helper for tests to set a mock client.
   */
  static setClient(client) {
    this.#client = client || cloudinary;
  }

  /**
   * Upload an image buffer to Cloudinary or fallback to development mock.
   */
  static async uploadImage(buffer, originalname, mimetype) {
    // 1. Strict validation
    validateImageFile(buffer, mimetype);

    // 2. Upload to Cloudinary if configured
    if (this.isConfigured()) {
      return new Promise((resolve, reject) => {
        const uploadStream = this.#client.uploader.upload_stream(
          {
            folder: 'arc_and_form/products',
            resource_type: 'image',
          },
          (error, result) => {
            if (error) {
              console.error('[cloudinary] Upload error:', error);
              return reject(
                ApiError.internal(`Cloudinary upload failed: ${error.message}`)
              );
            }
            resolve({
              url: result.secure_url || result.url,
              publicId: result.public_id,
            });
          }
        );

        Readable.from(buffer).pipe(uploadStream);
      });
    }

    // 3. Fallback mock response for local testing and development
    const mockId = `mock_${crypto.randomUUID().substring(0, 8)}`;
    const mockUrl =
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80';
    return {
      url: mockUrl,
      publicId: mockId,
    };
  }

  /**
   * Delete an image from Cloudinary by public ID.
   */
  static async deleteImage(publicId) {
    if (!publicId || typeof publicId !== 'string') {
      throw ApiError.badRequest('Public ID is required to delete an image');
    }

    if (this.isConfigured()) {
      try {
        const result = await this.#client.uploader.destroy(publicId);
        return { result: result.result || 'ok', publicId };
      } catch (err) {
        console.error('[cloudinary] Delete error:', err);
        throw ApiError.internal(`Failed to delete image: ${err.message}`);
      }
    }

    return { result: 'ok', publicId };
  }
}

// Initialize config on module load
CloudinaryService.init();
