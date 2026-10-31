package com.arcandform.auth;

import java.security.Principal;

public record UserPrincipal(
        Long id,
        String email,
        String role
) implements Principal {
    @Override
    public String getName() {
        return email;
    }
}
