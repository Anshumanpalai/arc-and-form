package com.arcandform.auth;

import com.arcandform.common.ApiException;
import com.arcandform.user.UserResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Authentication", description = "Customer and Administrator authentication endpoints")
public class AuthController {
    private final AuthService authService;
    private final CookieService cookieService;
    private final RateLimiterService rateLimiterService;

    public AuthController(
            AuthService authService,
            CookieService cookieService,
            RateLimiterService rateLimiterService
    ) {
        this.authService = authService;
        this.cookieService = cookieService;
        this.rateLimiterService = rateLimiterService;
    }

    @PostMapping("/register")
    @Operation(summary = "Register a new customer account")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request, HttpServletRequest servletRequest) {
        checkRateLimit(servletRequest);
        AuthService.AuthResult result = authService.register(request);
        ResponseCookie cookie = cookieService.createAuthCookie(result.token());

        return ResponseEntity.status(HttpStatus.CREATED)
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(new AuthResponse(result.user(), "Registration successful"));
    }

    @PostMapping("/login")
    @Operation(summary = "Authenticate customer or admin and receive httpOnly session cookie")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest servletRequest) {
        checkRateLimit(servletRequest);
        AuthService.AuthResult result = authService.login(request);
        ResponseCookie cookie = cookieService.createAuthCookie(result.token());

        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(new AuthResponse(result.user(), "Login successful"));
    }

    @PostMapping("/logout")
    @Operation(summary = "Clear httpOnly authentication session cookie")
    public ResponseEntity<AuthResponse> logout() {
        ResponseCookie cookie = cookieService.createCleanAuthCookie();
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, cookie.toString())
                .body(new AuthResponse(null, "Logged out successfully"));
    }

    @GetMapping("/me")
    @Operation(summary = "Get currently authenticated user details")
    public ResponseEntity<UserResponse> getCurrentUser(@AuthenticationPrincipal UserPrincipal principal) {
        if (principal == null) {
            return ResponseEntity.ok(null);
        }
        UserResponse response = authService.getCurrentUser(principal.id());
        return ResponseEntity.ok(response);
    }

    private void checkRateLimit(HttpServletRequest request) {
        String clientIp = getClientIp(request);
        if (!rateLimiterService.tryConsume(clientIp)) {
            throw new ApiException("Too many authentication requests. Please try again in a minute.", HttpStatus.TOO_MANY_REQUESTS);
        }
    }

    private String getClientIp(HttpServletRequest request) {
        String xf = request.getHeader("X-Forwarded-For");
        if (xf != null && !xf.isBlank()) {
            return xf.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
