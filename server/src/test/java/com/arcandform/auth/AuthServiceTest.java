package com.arcandform.auth;

import com.arcandform.common.ApiException;
import com.arcandform.user.Role;
import com.arcandform.user.User;
import com.arcandform.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtService jwtService;

    @InjectMocks
    private AuthService authService;

    private User sampleUser;

    @BeforeEach
    void setUp() {
        sampleUser = new User();
        sampleUser.setId(1L);
        sampleUser.setName("Marcus Thorne");
        sampleUser.setEmail("marcus@example.com");
        sampleUser.setPasswordHash("hashed_password");
        sampleUser.setRole(Role.CUSTOMER);
    }

    @Test
    @DisplayName("Register: successfully registers new customer with hashed password and returns token")
    void register_Success() {
        RegisterRequest request = new RegisterRequest("marcus@example.com", "Password@123", "Marcus Thorne");

        when(userRepository.existsByEmailIgnoreCase("marcus@example.com")).thenReturn(false);
        when(passwordEncoder.encode("Password@123")).thenReturn("hashed_password");
        when(userRepository.save(any(User.class))).thenReturn(sampleUser);
        when(jwtService.generateToken(1L, "marcus@example.com", "CUSTOMER")).thenReturn("jwt.token.here");

        AuthService.AuthResult result = authService.register(request);

        assertThat(result).isNotNull();
        assertThat(result.token()).isEqualTo("jwt.token.here");
        assertThat(result.user().email()).isEqualTo("marcus@example.com");
        assertThat(result.user().role()).isEqualTo(Role.CUSTOMER);

        verify(passwordEncoder).encode("Password@123");
        verify(userRepository).save(any(User.class));
    }

    @Test
    @DisplayName("Register: throws 409 Conflict when email already exists")
    void register_DuplicateEmail_ThrowsConflict() {
        RegisterRequest request = new RegisterRequest("marcus@example.com", "Password@123", "Marcus Thorne");

        when(userRepository.existsByEmailIgnoreCase("marcus@example.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getStatus()).isEqualTo(HttpStatus.CONFLICT));

        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    @DisplayName("Login: successfully authenticates valid customer credentials")
    void login_Success() {
        LoginRequest request = new LoginRequest("marcus@example.com", "Password@123");

        when(userRepository.findByEmailIgnoreCase("marcus@example.com")).thenReturn(Optional.of(sampleUser));
        when(passwordEncoder.matches("Password@123", "hashed_password")).thenReturn(true);
        when(jwtService.generateToken(1L, "marcus@example.com", "CUSTOMER")).thenReturn("jwt.token.here");

        AuthService.AuthResult result = authService.login(request);

        assertThat(result).isNotNull();
        assertThat(result.token()).isEqualTo("jwt.token.here");
        assertThat(result.user().name()).isEqualTo("Marcus Thorne");
    }

    @Test
    @DisplayName("Login: throws 401 Unauthorized when password does not match")
    void login_InvalidPassword_ThrowsUnauthorized() {
        LoginRequest request = new LoginRequest("marcus@example.com", "WrongPassword");

        when(userRepository.findByEmailIgnoreCase("marcus@example.com")).thenReturn(Optional.of(sampleUser));
        when(passwordEncoder.matches("WrongPassword", "hashed_password")).thenReturn(false);

        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED));
    }

    @Test
    @DisplayName("Login: throws 401 Unauthorized when user email not found")
    void login_UserNotFound_ThrowsUnauthorized() {
        LoginRequest request = new LoginRequest("unknown@example.com", "Password@123");

        when(userRepository.findByEmailIgnoreCase("unknown@example.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED));
    }
}
