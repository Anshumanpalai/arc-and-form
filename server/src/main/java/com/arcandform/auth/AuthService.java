package com.arcandform.auth;

import com.arcandform.common.ApiException;
import com.arcandform.common.ResourceNotFoundException;
import com.arcandform.user.Role;
import com.arcandform.user.User;
import com.arcandform.user.UserRepository;
import com.arcandform.user.UserResponse;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder, JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @Transactional
    public AuthResult register(RegisterRequest request) {
        String normalizedEmail = request.email().toLowerCase().trim();
        if (userRepository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw new ApiException("An account with this email already exists", HttpStatus.CONFLICT);
        }

        User user = new User(
                normalizedEmail,
                passwordEncoder.encode(request.password()),
                request.name().trim(),
                Role.CUSTOMER
        );

        User saved = userRepository.save(user);
        String token = jwtService.generateToken(saved.getId(), saved.getEmail(), saved.getRole().name());
        return new AuthResult(UserResponse.fromEntity(saved), token);
    }

    @Transactional(readOnly = true)
    public AuthResult login(LoginRequest request) {
        String normalizedEmail = request.email().toLowerCase().trim();
        User user = userRepository.findByEmailIgnoreCase(normalizedEmail)
                .orElseThrow(() -> new ApiException("Invalid email or password", HttpStatus.UNAUTHORIZED));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ApiException("Invalid email or password", HttpStatus.UNAUTHORIZED);
        }

        String token = jwtService.generateToken(user.getId(), user.getEmail(), user.getRole().name());
        return new AuthResult(UserResponse.fromEntity(user), token);
    }

    @Transactional(readOnly = true)
    public UserResponse getCurrentUser(Long userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        return UserResponse.fromEntity(user);
    }

    public record AuthResult(UserResponse user, String token) {}
}
