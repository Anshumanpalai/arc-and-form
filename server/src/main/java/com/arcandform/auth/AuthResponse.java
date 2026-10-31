package com.arcandform.auth;

import com.arcandform.user.UserResponse;

public record AuthResponse(
        UserResponse user,
        String message
) {}
