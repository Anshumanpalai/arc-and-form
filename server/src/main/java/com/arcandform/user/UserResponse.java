package com.arcandform.user;

import java.time.Instant;

public record UserResponse(
        Long id,
        String email,
        String name,
        Role role,
        Instant createdAt
) {
    public static UserResponse fromEntity(User user) {
        if (user == null) return null;
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getName(),
                user.getRole(),
                user.getCreatedAt()
        );
    }
}
