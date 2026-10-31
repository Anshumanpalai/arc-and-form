package com.arcandform.admin;

import com.arcandform.admin.dto.UploadImageResponse;
import com.arcandform.common.ApiException;
import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

@Service
public class CloudinaryService {
    private static final Logger log = LoggerFactory.getLogger(CloudinaryService.class);

    private final Cloudinary cloudinary;
    private final boolean isConfigured;

    public CloudinaryService(
            @Value("${cloudinary.cloud-name:}") String cloudName,
            @Value("${cloudinary.api-key:}") String apiKey,
            @Value("${cloudinary.api-secret:}") String apiSecret
    ) {
        if (cloudName != null && !cloudName.isBlank()
                && apiKey != null && !apiKey.isBlank()
                && apiSecret != null && !apiSecret.isBlank()) {
            this.cloudinary = new Cloudinary(ObjectUtils.asMap(
                    "cloud_name", cloudName,
                    "api_key", apiKey,
                    "api_secret", apiSecret,
                    "secure", true
            ));
            this.isConfigured = true;
            log.info("Cloudinary service initialized with cloud_name: {}", cloudName);
        } else {
            this.cloudinary = null;
            this.isConfigured = false;
            log.info("Cloudinary credentials not provided. Image upload will operate in local fallback mode.");
        }
    }

    public UploadImageResponse uploadImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException("No image file provided", HttpStatus.BAD_REQUEST);
        }

        String originalFilename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "upload.jpg";
        String contentType = file.getContentType();
        if (contentType != null && !contentType.startsWith("image/")) {
            throw new ApiException("Uploaded file must be an image (JPEG, PNG, WebP)", HttpStatus.BAD_REQUEST);
        }

        if (isConfigured && cloudinary != null) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, Object> uploadResult = cloudinary.uploader().upload(
                        file.getBytes(),
                        ObjectUtils.asMap(
                                "folder", "arc_and_form/products",
                                "resource_type", "image"
                        )
                );
                String secureUrl = (String) uploadResult.get("secure_url");
                String publicId = (String) uploadResult.get("public_id");
                return new UploadImageResponse(secureUrl, publicId);
            } catch (IOException e) {
                log.error("Failed to upload image to Cloudinary", e);
                throw new ApiException("Failed to upload image to Cloudinary: " + e.getMessage(), HttpStatus.INTERNAL_SERVER_ERROR);
            }
        }

        // Local development fallback
        String mockId = "mock_" + UUID.randomUUID().toString().substring(0, 8);
        String mockUrl = "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=1200&q=80";
        log.info("Cloudinary unconfigured: using development mock upload image URL: {}", mockUrl);
        return new UploadImageResponse(mockUrl, mockId);
    }
}
