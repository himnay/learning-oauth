package com.example.oauthapi.config;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

class JwtAuthenticationConverterTest {

    private final SecurityConfig securityConfig = new SecurityConfig();

    @Test
    void mapsKeycloakTokenToUsernameRolesAndScopes() {
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject("88dbadbc-680d-4019-9c05-e2d55b6bdbff")
                .claim("preferred_username", "demo")
                .claim("scope", "openid email")
                .claim("realm_access", Map.of("roles", List.of("api-user", "offline_access")))
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(300))
                .build();

        Authentication authentication = securityConfig.jwtAuthenticationConverter().convert(jwt);

        assertThat(authentication.getName()).isEqualTo("demo");
        assertThat(authentication.getAuthorities()).extracting(GrantedAuthority::getAuthority)
                .contains("SCOPE_openid", "SCOPE_email", "ROLE_api-user", "ROLE_offline_access");
    }
}
